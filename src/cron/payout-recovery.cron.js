const cron = require("node-cron");
const { WITHDRAWAL_STATUS } = require("../constants/withdrawals");
const {
  PAYOUT_PROVIDER_VALUES,
  PAYOUT_RECON_OUTCOME,
  PAYOUT_SOURCE,
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
} = require("../constants/payouts");
const Withdrawal = require("../schemas/withdrawal.schema");
const { getProvider } = require("../functions/payouts");
const {
  processPayoutOutboxBatch,
  hasTransferMismatch,
  recordPayoutReconciliation,
} = require("../modules/payouts/payout-execution.service");
const {
  processPayoutBatchOutboxBatch,
} = require("../modules/payouts/payout-batch.service");
const { processWebhook } = require("../modules/webhooks/webhooks.service");
const { safeText } = require("../modules/payouts/payout-utils");
const logger = require("../config/pino.config");

async function processPayoutReconciliationBatch() {
  const staleBefore = new Date(
    Date.now() - PAYOUT_CONFIG.RECONCILIATION_AGE_MS,
  );
  const retryBefore = new Date(
    Date.now() - PAYOUT_CONFIG.RECONCILIATION_RETRY_MS,
  );
  const staleWithdrawals = await Withdrawal.find({
    status: {
      $in: [WITHDRAWAL_STATUS.PROCESSING, WITHDRAWAL_STATUS.COMPLETED],
    },
    payoutProvider: { $in: PAYOUT_PROVIDER_VALUES },
    payoutBatchId: null,
    $or: [
      { lastPayoutReconciledAt: null },
      { lastPayoutReconciledAt: { $lt: retryBefore } },
    ],
    approvedAt: { $lt: staleBefore },
  })
    .select(
      "_id payoutProvider providerReferenceId providerTransferId approvedAt cashAmount",
    )
    .limit(PAYOUT_CONFIG.RECONCILIATION_BATCH_SIZE)
    .lean();

  for (const withdrawal of staleWithdrawals) {
    const requestedAt = new Date();
    if (!(await claimWithdrawal(withdrawal, retryBefore, requestedAt)))
      continue;
    await reconcileWithdrawal(withdrawal, requestedAt);
  }
}

async function claimWithdrawal(withdrawal, retryBefore, requestedAt) {
  const result = await Withdrawal.updateOne(
    {
      _id: withdrawal._id,
      status: {
        $in: [WITHDRAWAL_STATUS.PROCESSING, WITHDRAWAL_STATUS.COMPLETED],
      },
      payoutBatchId: null,
      $or: [
        { lastPayoutReconciledAt: null },
        { lastPayoutReconciledAt: { $lt: retryBefore } },
      ],
    },
    { $set: { lastPayoutReconciledAt: requestedAt } },
  );
  return result.modifiedCount > 0;
}

async function reconcileWithdrawal(withdrawal, requestedAt) {
  try {
    const provider = getProvider(withdrawal.payoutProvider);
    const transfer = await provider.getTransferStatus({
      referenceId: withdrawal.providerReferenceId,
    });
    if (!transfer) {
      await recordPayoutReconciliation({
        withdrawal,
        requestedAt,
        outcome: PAYOUT_RECON_OUTCOME.NOT_FOUND,
      });
      return;
    }

    const mismatch = hasTransferMismatch(withdrawal, transfer);
    await recordPayoutReconciliation({
      withdrawal,
      requestedAt,
      outcome: mismatch
        ? PAYOUT_RECON_OUTCOME.MISMATCH
        : PAYOUT_RECON_OUTCOME.MATCHED,
      transfer,
      errorMessage: mismatch
        ? PAYOUT_MESSAGE.PROVIDER_TRANSFER_DETAILS_MISMATCH
        : null,
    });
    if (mismatch) return;

    await processReconciliationTransfer(withdrawal, transfer);
  } catch (error) {
    await recordPayoutReconciliation({
      withdrawal,
      requestedAt,
      outcome: PAYOUT_RECON_OUTCOME.ERROR,
      errorMessage: error.message,
    });
    logger.error(PAYOUT_MESSAGE.RECONCILIATION_FAILED, {
      withdrawalId: String(withdrawal._id),
      provider: withdrawal.payoutProvider,
      error: safeText(error.message),
    });
  }
}

async function processReconciliationTransfer(withdrawal, transfer) {
  await processWebhook({}, Buffer.from(JSON.stringify(transfer)), transfer, {
    source: PAYOUT_SOURCE.RECONCILIATION,
    provider: withdrawal.payoutProvider,
    normalized: transfer,
  });
}

function registerPayoutRecoveryCron() {
  cron.schedule(PAYOUT_CONFIG.OUTBOX_CRON_EXPRESSION, async () => {
    try {
      await processPayoutOutboxBatch(PAYOUT_CONFIG.OUTBOX_BATCH_SIZE);
    } catch (error) {
      logger.error(PAYOUT_MESSAGE.OUTBOX_WORKER_FAILED, {
        error: safeText(error.message),
      });
    }
  });

  cron.schedule(PAYOUT_CONFIG.OUTBOX_CRON_EXPRESSION, async () => {
    try {
      await processPayoutBatchOutboxBatch(PAYOUT_CONFIG.OUTBOX_BATCH_SIZE);
    } catch (error) {
      logger.error(PAYOUT_MESSAGE.PAYOUT_BATCH_WORKER_FAILED, {
        error: safeText(error.message),
      });
    }
  });

  cron.schedule(PAYOUT_CONFIG.RECONCILIATION_CRON_EXPRESSION, async () => {
    try {
      await processPayoutReconciliationBatch();
    } catch (error) {
      logger.error(PAYOUT_MESSAGE.RECONCILIATION_SCAN_FAILED, {
        error: safeText(error.message),
      });
    }
  });
}

module.exports = {
  registerPayoutRecoveryCron,
  processPayoutReconciliationBatch,
};

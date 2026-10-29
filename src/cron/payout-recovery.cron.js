const cron = require("node-cron");
const { WITHDRAWAL_STATUS } = require("../constants/withdrawals");
const {
  PAYOUT_PROVIDER_VALUES,
  PAYOUT_RECON_OUTCOME,
  PAYOUT_CURRENCY,
  PAYOUT_SOURCE,
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
} = require("../constants/payouts");
const Withdrawal = require("../schemas/withdrawal.schema");
const PayoutRecon = require("../schemas/payout-recon.schema");
const { getProvider } = require("../functions/payouts");
const {
  processPayoutOutboxBatch,
} = require("../modules/withdrawals/payout-execution.service");
const { processWebhook } = require("../modules/webhooks/webhooks.service");
const { safeText } = require("../modules/withdrawals/payout-state.service");
const logger = require("../config/pino.config");

async function processPayoutReconciliationBatch() {
  const staleBefore = new Date(
    Date.now() - PAYOUT_CONFIG.RECONCILIATION_AGE_MS,
  );
  const retryBefore = new Date(
    Date.now() - PAYOUT_CONFIG.RECONCILIATION_RETRY_MS,
  );
  const stuck = await Withdrawal.find({
    status: {
      $in: [WITHDRAWAL_STATUS.PROCESSING, WITHDRAWAL_STATUS.COMPLETED],
    },
    payoutProvider: { $in: PAYOUT_PROVIDER_VALUES },
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

  for (const withdrawal of stuck) {
    const requestedAt = new Date();
    const claimed = await Withdrawal.updateOne(
      {
        _id: withdrawal._id,
        status: {
          $in: [WITHDRAWAL_STATUS.PROCESSING, WITHDRAWAL_STATUS.COMPLETED],
        },
        $or: [
          { lastPayoutReconciledAt: null },
          { lastPayoutReconciledAt: { $lt: retryBefore } },
        ],
      },
      { $set: { lastPayoutReconciledAt: requestedAt } },
    );
    if (!claimed.modifiedCount) continue;
    try {
      const provider = getProvider(withdrawal.payoutProvider);
      const transfer = await provider.getTransferStatus({
        referenceId: withdrawal.providerReferenceId,
      });
      if (!transfer) {
        await PayoutRecon.create({
          withdrawalId: withdrawal._id,
          provider: withdrawal.payoutProvider,
          providerTransferId: withdrawal.providerTransferId || null,
          payoutId: withdrawal.providerTransferId || null,
          providerReferenceId: withdrawal.providerReferenceId,
          referenceId: withdrawal.providerReferenceId,
          requestedAt,
          outcome: PAYOUT_RECON_OUTCOME.NOT_FOUND,
        });
        continue;
      }
      const mismatch =
        (transfer.providerReferenceId &&
          transfer.providerReferenceId !== withdrawal.providerReferenceId) ||
        (transfer.providerTransferId &&
          withdrawal.providerTransferId &&
          transfer.providerTransferId !== withdrawal.providerTransferId) ||
        (transfer.amountMinor != null &&
          Number(transfer.amountMinor) !==
            Math.round(
              withdrawal.cashAmount * PAYOUT_CONFIG.MINOR_UNITS_PER_INR,
            )) ||
        (transfer.currency && transfer.currency !== PAYOUT_CURRENCY.INR);
      await PayoutRecon.create({
        withdrawalId: withdrawal._id,
        provider: withdrawal.payoutProvider,
        providerTransferId: transfer.providerTransferId || null,
        payoutId: transfer.providerTransferId || null,
        providerReferenceId: withdrawal.providerReferenceId,
        referenceId: withdrawal.providerReferenceId,
        requestedAt,
        outcome: mismatch
          ? PAYOUT_RECON_OUTCOME.MISMATCH
          : PAYOUT_RECON_OUTCOME.MATCHED,
        providerStatus: transfer.rawStatus || transfer.status || null,
        providerResponse: transfer.safeResponse || {},
        ...(mismatch
          ? { errorMessage: PAYOUT_MESSAGE.PROVIDER_TRANSFER_DETAILS_MISMATCH }
          : {}),
      });
      if (mismatch) continue;
      await processWebhook(
        {},
        Buffer.from(JSON.stringify(transfer)),
        transfer,
        {
          source: PAYOUT_SOURCE.RECONCILIATION,
          provider: withdrawal.payoutProvider,
          normalized: transfer,
        },
      );
    } catch (error) {
      await PayoutRecon.create({
        withdrawalId: withdrawal._id,
        provider: withdrawal.payoutProvider,
        providerTransferId: withdrawal.providerTransferId || null,
        payoutId: withdrawal.providerTransferId || null,
        providerReferenceId: withdrawal.providerReferenceId,
        referenceId: withdrawal.providerReferenceId,
        requestedAt,
        outcome: PAYOUT_RECON_OUTCOME.ERROR,
        errorMessage: safeText(error.message),
      });
      logger.error(PAYOUT_MESSAGE.RECONCILIATION_FAILED, {
        withdrawalId: String(withdrawal._id),
        provider: withdrawal.payoutProvider,
        error: safeText(error.message),
      });
    }
  }
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

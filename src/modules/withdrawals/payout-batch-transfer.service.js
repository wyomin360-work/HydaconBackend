const mongoose = require("mongoose");
const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");
const {
  CASHFREE_PAYOUT_STATUS,
  PAYOUT_OUTBOX_STATUS: OUTBOX,
  PAYOUT_BATCH_STATUS: BATCH,
  PAYOUT_ATTEMPT_OUTCOME: ATTEMPT,
  PAYOUT_CURRENCY,
  PAYOUT_TRANSFER_MODE,
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
  PAYOUT_SOURCE,
  PAYOUT_RECON_OUTCOME,
  PAYOUT_TERMINAL_WITHDRAWAL_STATUSES,
} = require("../../constants/payouts");
const Withdrawal = require("../../schemas/withdrawal.schema");
const PayoutOutbox = require("../../schemas/payout-outbox.schema");
const PayoutBatch = require("../../schemas/payout-batch.schema");
const PayoutAttempt = require("../../schemas/payout-attempt.schema");
const { getProvider } = require("../../functions/payouts");
const {
  ensureBeneficiary,
  amountInMinorUnits,
  payoutNarration,
} = require("./payout-execution.service");
const { applyTransferUpdate } = require("./payout-state.service");
const {
  hasTransferMismatch,
  recordPayoutReconciliation,
} = require("./payout-reconciliation.service");
const { safeText } = require("./payout-utils");
const logger = require("../../config/pino.config");

async function mapWithConcurrency(items, concurrency, handler) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workerResults = await Promise.allSettled(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await handler(items[index], index);
      }
    }),
  );
  const failedWorker = workerResults.find(
    (result) => result.status === "rejected",
  );
  if (failedWorker) throw failedWorker.reason;
  return results;
}

async function loadBatchItems(batch) {
  const outboxes = await PayoutOutbox.find({ executionBatchId: batch._id })
    .sort({ createdAt: 1 })
    .lean();
  if (outboxes.length !== batch.withdrawalCount) {
    throw new Error(PAYOUT_MESSAGE.PAYOUT_BATCH_OUTBOX_INCOMPLETE);
  }

  const withdrawals = await Withdrawal.find({
    _id: { $in: outboxes.map((outbox) => outbox.withdrawalId) },
  })
    .select(
      "_id status payoutProvider providerReferenceId cashAmount userId bankAccountId approvedBy payoutAttemptCount providerTransferId utr failureReason",
    )
    .populate("userId", "_id email phone payoutContactId")
    .populate(
      "bankAccountId",
      "_id userId isActive accountHolderName accountNumber accountIv ifscCode ifscIv providerBeneficiaries payoutFundAccountId",
    )
    .lean();
  const withdrawalById = new Map(
    withdrawals.map((withdrawal) => [String(withdrawal._id), withdrawal]),
  );
  return outboxes.map((outbox) => ({
    outbox,
    withdrawal: withdrawalById.get(String(outbox.withdrawalId)),
  }));
}

function validateBatchItems(batch, items) {
  if (items.some(({ withdrawal }) => !withdrawal)) {
    throw new Error(PAYOUT_MESSAGE.PAYOUT_BATCH_WITHDRAWAL_MISSING);
  }
  for (const { outbox, withdrawal } of items) {
    if (
      withdrawal.payoutProvider !== batch.provider ||
      withdrawal.providerReferenceId !== outbox.providerReferenceId ||
      outbox.provider !== batch.provider
    ) {
      throw new Error(PAYOUT_MESSAGE.OUTBOX_WITHDRAWAL_MISMATCH);
    }
    const statusIsExpected =
      withdrawal.status === WITHDRAWAL_STATUS.PROCESSING ||
      PAYOUT_TERMINAL_WITHDRAWAL_STATUSES.includes(withdrawal.status);
    if (!statusIsExpected) {
      throw new Error(PAYOUT_MESSAGE.OUTBOX_WITHDRAWAL_MISMATCH);
    }
    const isProcessing = withdrawal.status === WITHDRAWAL_STATUS.PROCESSING;
    if (
      isProcessing &&
      (!withdrawal.userId || !withdrawal.bankAccountId?.isActive)
    ) {
      throw new Error(PAYOUT_MESSAGE.USER_OR_BANK_MISSING);
    }
  }
}

async function prepareBatchTransfers(provider, items) {
  return mapWithConcurrency(
    items,
    PAYOUT_CONFIG.CASHFREE_BATCH_BENEFICIARY_CONCURRENCY,
    async ({ outbox, withdrawal }) => {
      const beneficiary = await ensureBeneficiary(
        provider,
        withdrawal,
        withdrawal.userId,
        withdrawal.bankAccountId,
      );
      return {
        withdrawal,
        outbox,
        beneficiaryId: beneficiary.beneficiaryId,
        referenceId: outbox.providerReferenceId,
        amountMinor: amountInMinorUnits(withdrawal),
        currency: PAYOUT_CURRENCY.INR,
        mode: PAYOUT_TRANSFER_MODE.IMPS,
        narration: payoutNarration(withdrawal),
      };
    },
  );
}

async function createBatchAttempts(batch, transfers) {
  const session = await mongoose.startSession();
  let attemptsByWithdrawal = new Map();
  const requestStartedAt = new Date();
  try {
    await session.withTransaction(async () => {
      const incrementOperations = transfers.map(({ withdrawal }) => ({
        updateOne: {
          filter: {
            _id: withdrawal._id,
            status: WITHDRAWAL_STATUS.PROCESSING,
            payoutProvider: batch.provider,
          },
          update: { $inc: { payoutAttemptCount: 1 } },
        },
      }));
      const updateResult = await Withdrawal.bulkWrite(incrementOperations, {
        session,
      });
      if (updateResult.modifiedCount !== transfers.length) {
        throw new Error(PAYOUT_MESSAGE.WITHDRAWAL_CHANGED_BEFORE_REQUEST);
      }

      const withdrawals = await Withdrawal.find({
        _id: { $in: transfers.map(({ withdrawal }) => withdrawal._id) },
      })
        .session(session)
        .lean();
      const updatedById = new Map(
        withdrawals.map((withdrawal) => [String(withdrawal._id), withdrawal]),
      );
      const attemptDocuments = transfers.map((transfer) => {
        const withdrawal = updatedById.get(String(transfer.withdrawal._id));
        return {
          withdrawalId: withdrawal._id,
          attemptNumber: withdrawal.payoutAttemptCount,
          adminId: batch.adminId,
          provider: batch.provider,
          idempotencyKey: getProvider(batch.provider).createIdempotencyKey(
            transfer.referenceId,
          ),
          referenceId: transfer.referenceId,
          providerBatchReferenceId: batch.batchReferenceId,
          providerBeneficiaryId: transfer.beneficiaryId,
          fundAccountId: transfer.beneficiaryId,
          amountMinor: transfer.amountMinor,
          amount: transfer.amountMinor,
          currency: transfer.currency,
          mode: transfer.mode,
          narration: transfer.narration,
          requestStartedAt,
          outcome: ATTEMPT.REQUESTED,
        };
      });
      const attempts = await PayoutAttempt.insertMany(attemptDocuments, {
        session,
      });
      attemptsByWithdrawal = new Map(
        attempts.map((attempt) => [String(attempt.withdrawalId), attempt]),
      );
    });
  } finally {
    await session.endSession();
  }
  return { attemptsByWithdrawal, requestStartedAt };
}

async function recordBatchResponse(batch, result, startedAt) {
  const receivedAt = new Date();
  const safeResponse = result.safeResponse || {};
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const currentBatch = await PayoutBatch.findById(batch._id)
        .session(session)
        .lean();
      const isFirstProviderResponse = !currentBatch?.providerResponseReceivedAt;
      const rejectionReceived = [
        CASHFREE_PAYOUT_STATUS.REJECTED,
        CASHFREE_PAYOUT_STATUS.FAILED,
      ].includes(currentBatch?.providerStatus);
      const providerRejected =
        rejectionReceived ||
        [
          CASHFREE_PAYOUT_STATUS.REJECTED,
          CASHFREE_PAYOUT_STATUS.FAILED,
        ].includes(result.status);
      await PayoutBatch.updateOne(
        { _id: batch._id },
        {
          $set: {
            status: providerRejected
              ? BATCH.RECONCILIATION_REQUIRED
              : BATCH.SUBMITTED,
            providerBatchTransferId: result.providerBatchTransferId || null,
            providerStatus: rejectionReceived
              ? currentBatch.providerStatus
              : result.status || null,
            providerResponse: safeResponse,
            providerResponseReceivedAt:
              currentBatch?.providerResponseReceivedAt || receivedAt,
            lastError: null,
            availableAt: providerRejected
              ? new Date(Date.now() + PAYOUT_CONFIG.OUTBOX_LEASE_MS)
              : new Date(
                  receivedAt.getTime() +
                    PAYOUT_CONFIG.CASHFREE_BATCH_RECONCILIATION_INTERVAL_MS,
                ),
            leaseExpiresAt: providerRejected
              ? new Date(Date.now() + PAYOUT_CONFIG.OUTBOX_LEASE_MS)
              : null,
            processedAt: receivedAt,
          },
        },
        { session },
      );
      if (isFirstProviderResponse) {
        await PayoutOutbox.updateMany(
          { executionBatchId: batch._id },
          {
            $set: {
              status: OUTBOX.SUBMITTED,
              lastProviderStatus: result.status || null,
              lastProviderStatusCode: null,
              leaseExpiresAt: null,
              processedAt: receivedAt,
            },
          },
          { session },
        );
        await PayoutAttempt.updateMany(
          { providerBatchReferenceId: batch.batchReferenceId },
          {
            $set: {
              outcome: ATTEMPT.SUCCEEDED,
              providerBatchTransferId: result.providerBatchTransferId || null,
              providerStatus: result.status || null,
              providerResponse: safeResponse,
              responseReceivedAt: receivedAt,
              durationMs: receivedAt - startedAt,
            },
          },
          { session },
        );
      }
    });
  } finally {
    await session.endSession();
  }
}

async function markBatchFailed(batch, items, error) {
  const now = new Date();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await PayoutBatch.updateOne(
        { _id: batch._id },
        {
          $set: {
            status: BATCH.FAILED,
            lastError: safeText(error.message),
            leaseExpiresAt: null,
            processedAt: now,
          },
        },
        { session },
      );
      await PayoutOutbox.updateMany(
        { executionBatchId: batch._id },
        {
          $set: {
            status: OUTBOX.FAILED,
            lastError: safeText(error.message),
            leaseExpiresAt: null,
            processedAt: now,
          },
        },
        { session },
      );
      await PayoutAttempt.updateMany(
        { providerBatchReferenceId: batch.batchReferenceId },
        {
          $set: {
            outcome: ATTEMPT.DEFINITIVE_FAILURE,
            providerErrorDescription: safeText(error.message),
            responseReceivedAt: now,
          },
        },
        { session },
      );
      await Withdrawal.updateMany(
        {
          _id: { $in: items.map(({ withdrawal }) => withdrawal._id) },
          status: WITHDRAWAL_STATUS.PROCESSING,
          providerTransferId: null,
        },
        {
          $set: {
            status: WITHDRAWAL_STATUS.PENDING,
            payoutBatchId: null,
            approvedBy: null,
            approvedAt: null,
          },
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}

async function markBatchAmbiguous(batch, error) {
  const availableAt = new Date(Date.now() + retryDelay(batch.attempts));
  await PayoutBatch.updateOne(
    { _id: batch._id },
    {
      $set: {
        status: BATCH.RECONCILIATION_REQUIRED,
        lastError: safeText(error.message),
        availableAt,
        leaseExpiresAt: null,
      },
    },
  );
  await PayoutOutbox.updateMany(
    { executionBatchId: batch._id, status: { $ne: OUTBOX.SUBMITTED } },
    {
      $set: {
        status: OUTBOX.RECONCILIATION_REQUIRED,
        lastError: safeText(error.message),
        availableAt,
        leaseExpiresAt: null,
      },
    },
  );
}

function retryDelay(attempts) {
  return Math.min(
    PAYOUT_CONFIG.OUTBOX_RETRY_MAX_MS,
    PAYOUT_CONFIG.OUTBOX_RETRY_BASE_MS *
      2 ** Math.min(attempts || 0, PAYOUT_CONFIG.OUTBOX_RETRY_EXPONENT_LIMIT),
  );
}

async function reconcileBatchTransfers(batch, items, batchStatus) {
  const transfersByReference = new Map(
    (batchStatus.transfers || []).map((transfer) => [
      transfer.providerReferenceId,
      transfer,
    ]),
  );
  const reconciliationResults = await mapWithConcurrency(
    items,
    PAYOUT_CONFIG.CASHFREE_BATCH_BENEFICIARY_CONCURRENCY,
    async ({ outbox, withdrawal }) => {
      const transfer = transfersByReference.get(outbox.providerReferenceId);
      if (!transfer || !transfer.targetStatus) {
        const outcome = transfer
          ? PAYOUT_RECON_OUTCOME.ERROR
          : PAYOUT_RECON_OUTCOME.NOT_FOUND;
        const providerStatusChanged =
          transfer && hasProviderStatusChanged(outbox, transfer);
        const updateRequired =
          outbox.lastReconciliationOutcome !== outcome ||
          providerStatusChanged ||
          outbox.status !== OUTBOX.SUBMITTED;
        if (
          outbox.lastReconciliationOutcome !== outcome ||
          providerStatusChanged
        ) {
          await recordPayoutReconciliation({
            withdrawal,
            outcome,
            errorMessage: transfer
              ? PAYOUT_MESSAGE.PAYOUT_BATCH_TRANSFER_STATUS_INVALID
              : null,
          });
        }
        if (updateRequired) {
          await updateBatchOutboxReconciliation(outbox, transfer, outcome);
        }
        return null;
      }

      const transferMismatch = hasTransferMismatch(withdrawal, transfer);
      if (transferMismatch) {
        const statusChanged = hasProviderStatusChanged(outbox, transfer);
        const updateRequired =
          outbox.lastReconciliationOutcome !== PAYOUT_RECON_OUTCOME.MISMATCH ||
          statusChanged ||
          outbox.status !== OUTBOX.SUBMITTED;
        if (updateRequired) {
          if (
            outbox.lastReconciliationOutcome !==
              PAYOUT_RECON_OUTCOME.MISMATCH ||
            statusChanged
          ) {
            await recordPayoutReconciliation({
              withdrawal,
              outcome: PAYOUT_RECON_OUTCOME.MISMATCH,
              transfer,
              errorMessage: PAYOUT_MESSAGE.PROVIDER_TRANSFER_DETAILS_MISMATCH,
            });
          }
          await updateBatchOutboxReconciliation(
            outbox,
            transfer,
            PAYOUT_RECON_OUTCOME.MISMATCH,
          );
        }
        return null;
      }

      const updateRequired =
        hasProviderStatusChanged(outbox, transfer) ||
        outbox.lastReconciliationOutcome !== PAYOUT_RECON_OUTCOME.MATCHED ||
        withdrawal.providerTransferId !== transfer.providerTransferId ||
        (transfer.utr && withdrawal.utr !== transfer.utr) ||
        (transfer.failureReason &&
          withdrawal.failureReason !== transfer.failureReason);
      if (updateRequired) {
        await recordPayoutReconciliation({
          withdrawal,
          outcome: PAYOUT_RECON_OUTCOME.MATCHED,
          transfer,
        });
        await applyTransferUpdate({
          withdrawal,
          provider: batch.provider,
          normalized: transfer,
          source: PAYOUT_SOURCE.PAYOUT_RECONCILIATION,
        });
        await updateBatchOutboxReconciliation(
          outbox,
          transfer,
          PAYOUT_RECON_OUTCOME.MATCHED,
        );
      }
      return transfer;
    },
  );
  const unresolvedCount = reconciliationResults.filter(
    (result) => result === null,
  ).length;

  if (unresolvedCount > 0) {
    const error = new Error(
      PAYOUT_MESSAGE.PAYOUT_BATCH_TRANSFER_STATUS_INCOMPLETE(unresolvedCount),
    );
    await markBatchAmbiguous(batch, error);
    return;
  }

  const allTransfersTerminal = reconciliationResults.every((transfer) =>
    PAYOUT_TERMINAL_WITHDRAWAL_STATUSES.includes(transfer.targetStatus),
  );
  const now = new Date();
  await PayoutBatch.updateOne(
    { _id: batch._id },
    {
      $set: {
        status: allTransfersTerminal ? BATCH.RECONCILED : BATCH.SUBMITTED,
        lastError: null,
        availableAt: new Date(
          now.getTime() +
            (allTransfersTerminal
              ? PAYOUT_CONFIG.RECONCILIATION_RETRY_MS
              : PAYOUT_CONFIG.CASHFREE_BATCH_RECONCILIATION_INTERVAL_MS),
        ),
        leaseExpiresAt: null,
        processedAt: now,
      },
    },
  );
}

function hasProviderStatusChanged(outbox, transfer) {
  return (
    outbox.lastProviderStatus !== transfer.rawStatus ||
    outbox.lastProviderStatusCode !== transfer.statusCode
  );
}

function updateBatchOutboxReconciliation(outbox, transfer, outcome) {
  return PayoutOutbox.updateOne(
    { _id: outbox._id },
    {
      $set: {
        status: OUTBOX.SUBMITTED,
        lastProviderStatus: transfer?.rawStatus || transfer?.status || null,
        lastProviderStatusCode: transfer?.statusCode || null,
        lastReconciliationOutcome: outcome,
        leaseExpiresAt: null,
        processedAt: new Date(),
      },
    },
  );
}

function isRejectedBatchStatus(status) {
  return [
    CASHFREE_PAYOUT_STATUS.REJECTED,
    CASHFREE_PAYOUT_STATUS.FAILED,
  ].includes(status);
}

async function submitOrReconcileBatch(batch) {
  const provider = getProvider(batch.provider);
  const items = await loadBatchItems(batch);
  validateBatchItems(batch, items);
  const rejectionWasReported = isRejectedBatchStatus(batch.providerStatus);

  let existingBatch;
  try {
    existingBatch = await provider.getBatchTransferStatus({
      batchReferenceId: batch.batchReferenceId,
    });
  } catch (error) {
    error.definitive = false;
    throw error;
  }

  if (existingBatch) {
    await recordBatchResponse(batch, existingBatch, new Date());
    const rejectionReceived =
      rejectionWasReported || isRejectedBatchStatus(existingBatch.status);
    if (rejectionReceived || existingBatch.transfers?.length) {
      await reconcileBatchTransfers(batch, items, existingBatch);
    }
    return;
  }

  if (rejectionWasReported || batch.providerResponseReceivedAt) {
    throw new Error(PAYOUT_MESSAGE.PAYOUT_BATCH_STATUS_UNKNOWN);
  }

  let transfers;
  try {
    transfers = await prepareBatchTransfers(provider, items);
  } catch (error) {
    if (error.definitive) {
      await markBatchFailed(batch, items, error);
      return;
    }
    throw error;
  }

  const { attemptsByWithdrawal, requestStartedAt } = await createBatchAttempts(
    batch,
    transfers,
  );
  try {
    const result = await provider.initiateBatchTransfer({
      batchReferenceId: batch.batchReferenceId,
      transfers,
    });
    if (!result?.batchReferenceId) {
      const error = new Error(PAYOUT_MESSAGE.TRANSFER_ID_MISSING);
      error.definitive = false;
      throw error;
    }
    await recordBatchResponse(batch, result, requestStartedAt);
    if (isRejectedBatchStatus(result.status) || result.transfers?.length) {
      await reconcileBatchTransfers(batch, items, result);
    }
  } catch (error) {
    if (error.definitive) {
      await markBatchFailed(batch, items, error);
      return;
    }
    await Promise.all(
      transfers.map(({ withdrawal }) => {
        const attempt = attemptsByWithdrawal.get(String(withdrawal._id));
        return PayoutAttempt.updateOne(
          { _id: attempt._id },
          {
            $set: {
              outcome: ATTEMPT.AMBIGUOUS_FAILURE,
              providerErrorDescription: safeText(error.message),
              responseReceivedAt: new Date(),
            },
          },
        );
      }),
    );
    throw error;
  }
}

module.exports = { markBatchAmbiguous, submitOrReconcileBatch };

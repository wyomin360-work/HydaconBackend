const crypto = require("crypto");
const mongoose = require("mongoose");
const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");
const { KYC_STATUS } = require("../../constants/user");
const {
  PAYOUT_PROVIDER,
  PAYOUT_APPROVAL_SOURCE,
  PAYOUT_BENEFICIARY_STATUS,
  PAYOUT_PROVIDER_ENVIRONMENT,
  CASHFREE_PAYOUT_STATUS,
  PAYOUT_OUTBOX_STATUS: OUTBOX,
  PAYOUT_BATCH_STATUS: BATCH,
  PAYOUT_ATTEMPT_OUTCOME: ATTEMPT,
  PAYOUT_CURRENCY,
  PAYOUT_TRANSFER_MODE,
  PAYOUT_HTTP_STATUS,
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
  PAYOUT_SOURCE,
  PAYOUT_RECON_OUTCOME,
  PAYOUT_OPERATION,
  PAYOUT_TERMINAL_WITHDRAWAL_STATUSES,
} = require("../../constants/payouts");
const Withdrawal = require("../../schemas/withdrawal.schema");
const PayoutOutbox = require("../../schemas/payout-outbox.schema");
const PayoutBatch = require("../../schemas/payout-batch.schema");
const PayoutAttempt = require("../../schemas/payout-attempt.schema");
const PayoutRecon = require("../../schemas/payout-recon.schema");
const { currentProviderName, getProvider } = require("../../functions/payouts");
const {
  ensureBeneficiary,
  amountInMinorUnits,
  payoutNarration,
  hasTransferMismatch,
  recordPayoutReconciliation,
} = require("./payout-execution.service");
const { applyTransferUpdate } = require("./payout-state.service");
const { safeText } = require("./payout-utils");
const { sendFailResponse } = require("../../utils/responseHandlers");
const logger = require("../../config/pino.config");

function batchValidationError(
  message,
  statusCode = PAYOUT_HTTP_STATUS.BAD_REQUEST,
) {
  sendFailResponse(message, statusCode);
}

function maxBatchSize() {
  return process.env.CASHFREE_PAYOUT_ENV ===
    PAYOUT_PROVIDER_ENVIRONMENT.PRODUCTION
    ? PAYOUT_CONFIG.CASHFREE_BATCH_PRODUCTION_MAX_SIZE
    : PAYOUT_CONFIG.CASHFREE_BATCH_SANDBOX_MAX_SIZE;
}

function assertBatchSize(withdrawalIds) {
  const minimum = PAYOUT_CONFIG.CASHFREE_BATCH_MIN_SIZE;
  const maximum = maxBatchSize();
  if (
    !Array.isArray(withdrawalIds) ||
    withdrawalIds.length < minimum ||
    withdrawalIds.length > maximum
  ) {
    batchValidationError(
      PAYOUT_MESSAGE.PAYOUT_BATCH_SIZE_INVALID(minimum, maximum),
    );
  }
  if (new Set(withdrawalIds).size !== withdrawalIds.length) {
    batchValidationError(PAYOUT_MESSAGE.PAYOUT_BATCH_DUPLICATE_WITHDRAWALS);
  }
}

function validateBatchWithdrawals(withdrawals, withdrawalIds, providerName) {
  if (withdrawals.length !== withdrawalIds.length) {
    batchValidationError(
      PAYOUT_MESSAGE.WITHDRAWAL_NOT_FOUND,
      PAYOUT_HTTP_STATUS.NOT_FOUND,
    );
  }

  for (const withdrawal of withdrawals) {
    const id = String(withdrawal._id);
    if (withdrawal.status !== WITHDRAWAL_STATUS.PENDING) {
      batchValidationError(
        PAYOUT_MESSAGE.PAYOUT_BATCH_WITHDRAWAL_INELIGIBLE(
          id,
          `status is ${withdrawal.status}`,
        ),
        PAYOUT_HTTP_STATUS.CONFLICT,
      );
    }
    if (
      withdrawal.payoutProvider &&
      withdrawal.payoutProvider !== providerName
    ) {
      batchValidationError(
        PAYOUT_MESSAGE.PAYOUT_BATCH_WITHDRAWAL_INELIGIBLE(
          id,
          PAYOUT_MESSAGE.PAYOUT_BATCH_PROVIDER_CONFLICT,
        ),
        PAYOUT_HTTP_STATUS.CONFLICT,
      );
    }
    if (withdrawal.providerTransferId) {
      batchValidationError(
        PAYOUT_MESSAGE.PAYOUT_BATCH_WITHDRAWAL_INELIGIBLE(
          id,
          PAYOUT_MESSAGE.PAYOUT_BATCH_TRANSFER_EXISTS,
        ),
        PAYOUT_HTTP_STATUS.CONFLICT,
      );
    }

    const amount = Number(withdrawal.cashAmount);
    const amountMinor = amountInMinorUnits(withdrawal);
    if (
      !Number.isFinite(amount) ||
      amount <= 1 ||
      !Number.isSafeInteger(amountMinor) ||
      Math.abs(amount * PAYOUT_CONFIG.MINOR_UNITS_PER_INR - amountMinor) > 1e-7
    ) {
      batchValidationError(
        PAYOUT_MESSAGE.PAYOUT_BATCH_WITHDRAWAL_INELIGIBLE(
          id,
          PAYOUT_MESSAGE.PAYOUT_BATCH_AMOUNT_INVALID,
        ),
      );
    }

    const user = withdrawal.userId;
    const bankAccount = withdrawal.bankAccountId;
    if (!user || !bankAccount || !bankAccount.isActive) {
      batchValidationError(
        PAYOUT_MESSAGE.PAYOUT_BATCH_WITHDRAWAL_INELIGIBLE(
          id,
          PAYOUT_MESSAGE.PAYOUT_BATCH_BANK_UNAVAILABLE,
        ),
      );
    }
    if (user.kycStatus !== KYC_STATUS.APPROVED) {
      batchValidationError(
        PAYOUT_MESSAGE.PAYOUT_BATCH_WITHDRAWAL_INELIGIBLE(
          id,
          PAYOUT_MESSAGE.KYC_REQUIRED,
        ),
        PAYOUT_HTTP_STATUS.CONFLICT,
      );
    }
    if (String(bankAccount.userId) !== String(user._id)) {
      batchValidationError(
        PAYOUT_MESSAGE.PAYOUT_BATCH_WITHDRAWAL_INELIGIBLE(
          id,
          PAYOUT_MESSAGE.PAYOUT_BATCH_BANK_OWNER_MISMATCH,
        ),
        PAYOUT_HTTP_STATUS.CONFLICT,
      );
    }
  }
}

async function getValidatedWithdrawals(withdrawalIds, session) {
  return Withdrawal.find({ _id: { $in: withdrawalIds } })
    .select(
      "_id status payoutProvider providerTransferId providerReferenceId cashAmount userId bankAccountId",
    )
    .populate("userId", "_id kycStatus")
    .populate("bankAccountId", "_id userId isActive")
    .session(session)
    .lean();
}

function makeBatchReferenceId() {
  return `${PAYOUT_CONFIG.CASHFREE_BATCH_REFERENCE_PREFIX}${crypto
    .randomUUID()
    .replace(/-/g, "")}`;
}

async function enqueueApprovedWithdrawalBatch(adminId, withdrawalIds) {
  assertBatchSize(withdrawalIds);
  const providerName = currentProviderName();
  if (providerName !== PAYOUT_PROVIDER.CASHFREE) {
    batchValidationError(
      PAYOUT_MESSAGE.PAYOUT_BATCH_PROVIDER_REQUIRED,
      PAYOUT_HTTP_STATUS.CONFLICT,
    );
  }

  const provider = getProvider(providerName);
  try {
    provider.validateConfig?.();
  } catch (error) {
    batchValidationError(
      error.message || PAYOUT_MESSAGE.PAYOUT_BATCH_PROVIDER_REQUIRED,
      PAYOUT_HTTP_STATUS.SERVICE_UNAVAILABLE,
    );
  }
  if (typeof provider.initiateBatchTransfer !== "function") {
    batchValidationError(
      PAYOUT_MESSAGE.UNSUPPORTED_PROVIDER,
      PAYOUT_HTTP_STATUS.CONFLICT,
    );
  }

  const batchReferenceId = makeBatchReferenceId();
  const session = await mongoose.startSession();
  let batch;
  try {
    await session.withTransaction(async () => {
      const withdrawals = await getValidatedWithdrawals(withdrawalIds, session);
      validateBatchWithdrawals(withdrawals, withdrawalIds, providerName);

      const now = new Date();
      batch = new PayoutBatch({
        provider: providerName,
        batchReferenceId,
        status: BATCH.PENDING,
        withdrawalCount: withdrawalIds.length,
        adminId,
        availableAt: now,
      });
      const updateResult = await Withdrawal.updateMany(
        {
          _id: { $in: withdrawalIds },
          status: WITHDRAWAL_STATUS.PENDING,
          payoutProvider: { $in: [null, providerName] },
        },
        {
          $set: {
            status: WITHDRAWAL_STATUS.PROCESSING,
            payoutProvider: providerName,
            payoutBatchId: batch._id,
            approvedBy: adminId,
            approvedAt: now,
            approvalSource: PAYOUT_APPROVAL_SOURCE.ADMIN,
          },
        },
        { session },
      );
      if (updateResult.modifiedCount !== withdrawalIds.length) {
        batchValidationError(
          PAYOUT_MESSAGE.PAYOUT_BATCH_CHANGED_DURING_APPROVAL,
          PAYOUT_HTTP_STATUS.CONFLICT,
        );
      }

      await batch.save({ session });

      const outboxOperations = withdrawals.map((withdrawal) => {
        const referenceId =
          withdrawal.providerReferenceId || String(withdrawal._id);
        return {
          updateOne: {
            filter: { withdrawalId: withdrawal._id },
            update: {
              $set: {
                provider: providerName,
                providerReferenceId: referenceId,
                executionBatchId: batch._id,
                status: OUTBOX.PENDING,
                availableAt: now,
                lastError: null,
                leaseExpiresAt: null,
              },
              $setOnInsert: { withdrawalId: withdrawal._id },
            },
            upsert: true,
          },
        };
      });
      await PayoutOutbox.bulkWrite(outboxOperations, { session });
    });
  } finally {
    await session.endSession();
  }

  wakePayoutBatchWorker();
  return {
    batchId: batch._id,
    batchReferenceId,
    status: WITHDRAWAL_STATUS.PROCESSING,
    payoutProvider: providerName,
    withdrawalIds,
  };
}

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
      if (beneficiary.status !== PAYOUT_BENEFICIARY_STATUS.READY) {
        throw new Error(PAYOUT_MESSAGE.BENEFICIARY_NOT_READY);
      }
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

async function markBatchAmbiguous(batch, error, affectedItems = null) {
  const consecutiveFailures = (batch.consecutiveFailures || 0) + 1;
  const retryLimitReached =
    consecutiveFailures >= PAYOUT_CONFIG.OUTBOX_MAX_ATTEMPTS;
  const now = new Date();
  const availableAt = retryLimitReached
    ? null
    : new Date(now.getTime() + retryDelay(consecutiveFailures));
  const session = await mongoose.startSession();
  let auditItems = affectedItems;

  try {
    await session.withTransaction(async () => {
      if (!auditItems) auditItems = await loadBatchAuditItems(batch, session);

      await PayoutRecon.insertMany(
        auditItems
          .filter(({ withdrawal }) => withdrawal)
          .map(({ outbox, withdrawal }) => ({
            withdrawalId: withdrawal._id,
            provider: batch.provider,
            providerReferenceId: withdrawal.providerReferenceId,
            referenceId: outbox.providerReferenceId,
            requestedAt: now,
            retryAttempt: consecutiveFailures,
            operation:
              error.payoutOperation || PAYOUT_OPERATION.BATCH_RECONCILIATION,
            outcome: PAYOUT_RECON_OUTCOME.ERROR,
            providerStatus: batch.providerStatus || null,
            providerStatusCode: error.providerStatusCode || null,
            providerErrorCode: error.providerErrorCode
              ? safeText(error.providerErrorCode)
              : null,
            errorMessage: safeText(error.message),
          })),
        { session, ordered: true },
      );

      await PayoutBatch.updateOne(
        { _id: batch._id },
        {
          $set: {
            status: retryLimitReached
              ? BATCH.MANUAL_REVIEW
              : BATCH.RECONCILIATION_REQUIRED,
            consecutiveFailures,
            retryExhaustedAt: retryLimitReached ? now : null,
            lastError: safeText(error.message),
            availableAt,
            leaseExpiresAt: null,
            processedAt: now,
          },
        },
        { session },
      );

      if (retryLimitReached) {
        const unresolvedOutboxIds = auditItems
          .filter(({ outbox, withdrawal }) => outbox && withdrawal)
          .map(({ outbox }) => outbox._id);
        await PayoutOutbox.updateMany(
          { _id: { $in: unresolvedOutboxIds } },
          {
            $set: {
              status: OUTBOX.FAILED,
              lastError: safeText(error.message),
              retryExhaustedAt: now,
              manualReviewRequired: true,
              availableAt: null,
              leaseExpiresAt: null,
              processedAt: now,
            },
          },
          { session },
        );
      }
    });
  } finally {
    await session.endSession();
  }

  logger.error(PAYOUT_MESSAGE.PAYOUT_BATCH_WORKER_FAILED, {
    batchReferenceId: batch.batchReferenceId,
    consecutiveFailures,
    maxAttempts: PAYOUT_CONFIG.OUTBOX_MAX_ATTEMPTS,
    retryLimitReached,
    error: safeText(error.message),
  });
}

async function loadBatchAuditItems(batch, session) {
  const outboxes = await PayoutOutbox.find({ executionBatchId: batch._id })
    .select("_id withdrawalId providerReferenceId")
    .session(session)
    .lean();
  const withdrawals = await Withdrawal.find({
    _id: { $in: outboxes.map((outbox) => outbox.withdrawalId) },
  })
    .select("_id payoutProvider providerReferenceId")
    .session(session)
    .lean();
  const withdrawalsById = new Map(
    withdrawals.map((withdrawal) => [String(withdrawal._id), withdrawal]),
  );
  return outboxes.map((outbox) => ({
    outbox,
    withdrawal: withdrawalsById.get(String(outbox.withdrawalId)),
  }));
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
    error.payoutOperation = PAYOUT_OPERATION.BATCH_RECONCILIATION;
    const unresolvedItems = items.filter(
      (_item, index) => reconciliationResults[index] === null,
    );
    await markBatchAmbiguous(batch, error, unresolvedItems);
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
        consecutiveFailures: 0,
        retryExhaustedAt: null,
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
        lastError: null,
        retryExhaustedAt: null,
        manualReviewRequired: false,
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
    error.payoutOperation = PAYOUT_OPERATION.BATCH_STATUS_LOOKUP;
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
    error.payoutOperation = PAYOUT_OPERATION.BENEFICIARY_SETUP;
    throw error;
  }

  let attemptsByWithdrawal;
  let requestStartedAt;
  try {
    ({ attemptsByWithdrawal, requestStartedAt } = await createBatchAttempts(
      batch,
      transfers,
    ));
  } catch (error) {
    error.payoutOperation = PAYOUT_OPERATION.TRANSFER_ATTEMPT_CREATION;
    throw error;
  }
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
    error.payoutOperation = PAYOUT_OPERATION.BATCH_TRANSFER_SUBMISSION;
    throw error;
  }
}

async function processPayoutBatchOutboxBatch(
  limit = PAYOUT_CONFIG.OUTBOX_BATCH_SIZE,
) {
  for (let index = 0; index < limit; index += 1) {
    const now = new Date();
    const batch = await PayoutBatch.findOneAndUpdate(
      {
        status: {
          $in: [
            BATCH.PENDING,
            BATCH.RECONCILIATION_REQUIRED,
            BATCH.PROCESSING,
            BATCH.SUBMITTED,
            BATCH.RECONCILED,
          ],
        },
        availableAt: { $lte: now },
        $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lte: now } }],
      },
      {
        $set: {
          status: BATCH.PROCESSING,
          leaseExpiresAt: new Date(
            now.getTime() + PAYOUT_CONFIG.OUTBOX_LEASE_MS,
          ),
        },
        $inc: { attempts: 1 },
      },
      { new: true, sort: { availableAt: 1 } },
    );
    if (!batch) break;
    const leaseHeartbeat = startBatchLeaseHeartbeat(batch);
    try {
      await submitOrReconcileBatch(batch);
    } catch (error) {
      await markBatchAmbiguous(batch, error);
      logger.error(PAYOUT_MESSAGE.PAYOUT_BATCH_WORKER_FAILED, {
        batchReferenceId: batch.batchReferenceId,
        error: safeText(error.message),
      });
    } finally {
      clearInterval(leaseHeartbeat);
    }
  }
}

function startBatchLeaseHeartbeat(batch) {
  return setInterval(() => {
    PayoutBatch.updateOne(
      {
        _id: batch._id,
        status: { $in: [BATCH.PROCESSING, BATCH.RECONCILIATION_REQUIRED] },
      },
      {
        $set: {
          leaseExpiresAt: new Date(Date.now() + PAYOUT_CONFIG.OUTBOX_LEASE_MS),
        },
      },
    ).catch((error) => {
      logger.error(PAYOUT_MESSAGE.PAYOUT_BATCH_WORKER_FAILED, {
        batchReferenceId: batch.batchReferenceId,
        error: safeText(error.message),
      });
    });
  }, PAYOUT_CONFIG.OUTBOX_LEASE_RENEW_INTERVAL_MS);
}

function wakePayoutBatchWorker() {
  processPayoutBatchOutboxBatch(PAYOUT_CONFIG.OUTBOX_BATCH_SIZE).catch(
    (error) => {
      logger.error(PAYOUT_MESSAGE.PAYOUT_BATCH_WORKER_FAILED, {
        error: safeText(error.message),
      });
    },
  );
}

async function queueCashfreeBatchReconciliation(normalized) {
  const batch = await findCashfreeBatch(normalized);
  if (!batch) return false;

  const queuedBatch = await PayoutBatch.findOneAndUpdate(
    { _id: batch._id, status: { $ne: BATCH.FAILED } },
    {
      $set: {
        status: BATCH.RECONCILIATION_REQUIRED,
        consecutiveFailures: 0,
        retryExhaustedAt: null,
        providerStatus: CASHFREE_PAYOUT_STATUS.REJECTED,
        lastError: PAYOUT_MESSAGE.PAYOUT_BATCH_RECONCILIATION_QUEUED,
        availableAt: new Date(),
      },
    },
    { new: true },
  );
  if (!queuedBatch) return false;

  await PayoutOutbox.updateMany(
    batch.status === BATCH.MANUAL_REVIEW
      ? { executionBatchId: batch._id }
      : { executionBatchId: batch._id, status: OUTBOX.SUBMITTED },
    {
      $set: {
        status: OUTBOX.RECONCILIATION_REQUIRED,
        lastError: PAYOUT_MESSAGE.PAYOUT_BATCH_RECONCILIATION_QUEUED,
        availableAt: new Date(),
        retryExhaustedAt: null,
        manualReviewRequired: false,
      },
    },
  );
  wakePayoutBatchWorker();
  return true;
}

async function findCashfreeBatch(normalized) {
  const providerFilter = { provider: PAYOUT_PROVIDER.CASHFREE };
  let batch = null;

  if (normalized.batchReferenceId) {
    batch = await PayoutBatch.findOne({
      ...providerFilter,
      batchReferenceId: normalized.batchReferenceId,
    }).lean();
  }

  if (
    batch &&
    normalized.providerBatchTransferId &&
    batch.providerBatchTransferId &&
    batch.providerBatchTransferId !== normalized.providerBatchTransferId
  ) {
    return null;
  }
  if (batch || !normalized.providerBatchTransferId) return batch;

  return PayoutBatch.findOne({
    ...providerFilter,
    providerBatchTransferId: normalized.providerBatchTransferId,
  }).lean();
}

module.exports = {
  enqueueApprovedWithdrawalBatch,
  processPayoutBatchOutboxBatch,
  wakePayoutBatchWorker,
  queueCashfreeBatchReconciliation,
  markBatchAmbiguous,
  submitOrReconcileBatch,
};

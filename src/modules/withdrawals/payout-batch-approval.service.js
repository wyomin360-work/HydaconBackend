const crypto = require("crypto");
const mongoose = require("mongoose");
const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");
const {
  PAYOUT_PROVIDER,
  PAYOUT_PROVIDER_ENVIRONMENT,
  PAYOUT_OUTBOX_STATUS: OUTBOX,
  PAYOUT_BATCH_STATUS: BATCH,
  PAYOUT_HTTP_STATUS,
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
} = require("../../constants/payouts");
const Withdrawal = require("../../schemas/withdrawal.schema");
const PayoutOutbox = require("../../schemas/payout-outbox.schema");
const PayoutBatch = require("../../schemas/payout-batch.schema");
const { currentProviderName, getProvider } = require("../../functions/payouts");
const { amountInMinorUnits } = require("./payout-execution.service");
const { wakePayoutBatchWorker } = require("./payout-batch-worker.service");
const { sendFailResponse } = require("../../utils/responseHandlers");

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
    .populate("userId", "_id")
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

module.exports = { enqueueApprovedWithdrawalBatch };

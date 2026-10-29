const crypto = require("crypto");
const mongoose = require("mongoose");
const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");
const {
  PAYOUT_PROVIDER,
  PAYOUT_OUTBOX_STATUS: OUTBOX,
  PAYOUT_ATTEMPT_OUTCOME: ATTEMPT,
  PAYOUT_CURRENCY,
  PAYOUT_TRANSFER_MODE,
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
  PAYOUT_SOURCE,
  PAYOUT_RECON_OUTCOME,
} = require("../../constants/payouts");
const Withdrawal = require("../../schemas/withdrawal.schema");
const UserBankAccount = require("../../schemas/user-bank-account.schema");
const PayoutAttempt = require("../../schemas/payout-attempt.schema");
const PayoutOutbox = require("../../schemas/payout-outbox.schema");
const PayoutRecon = require("../../schemas/payout-recon.schema");
const { getProvider, currentProviderName } = require("../../functions/payouts");
const { decrypt } = require("../../utils/encryption");
const { applyTransferUpdate, safeText } = require("./payout-state.service");
const logger = require("../../config/pino.config");

async function enqueueApprovedWithdrawal(adminId, withdrawalId) {
  const session = await mongoose.startSession();
  let withdrawal;
  try {
    await session.withTransaction(async () => {
      withdrawal = await Withdrawal.findOne({
        _id: withdrawalId,
        status: WITHDRAWAL_STATUS.PENDING,
      }).session(session);
      if (!withdrawal) return;
      const provider = withdrawal.payoutProvider || currentProviderName();
      getProvider(provider).validateConfig?.();
      const referenceId =
        withdrawal.providerReferenceId || String(withdrawal._id);
      withdrawal.status = WITHDRAWAL_STATUS.PROCESSING;
      withdrawal.payoutProvider = provider;
      withdrawal.providerReferenceId = referenceId;
      withdrawal.approvedBy = adminId;
      withdrawal.approvedAt = new Date();
      await withdrawal.save({ session });
      await PayoutOutbox.findOneAndUpdate(
        { withdrawalId: withdrawal._id },
        {
          $set: {
            provider,
            providerReferenceId: referenceId,
            status: OUTBOX.PENDING,
            availableAt: new Date(),
            lastError: null,
            leaseExpiresAt: null,
          },
          $setOnInsert: {
            withdrawalId: withdrawal._id,
          },
        },
        { upsert: true, new: true, session, setDefaultsOnInsert: true },
      );
    });
  } finally {
    await session.endSession();
  }
  if (!withdrawal) {
    const current = await Withdrawal.findById(withdrawalId)
      .select("status")
      .lean();
    if (!current) throw new Error(PAYOUT_MESSAGE.WITHDRAWAL_NOT_FOUND);
    throw new Error(PAYOUT_MESSAGE.WITHDRAWAL_APPROVAL_STATUS(current.status));
  }
  return {
    id: withdrawal._id,
    status: withdrawal.status,
    payoutProvider: withdrawal.payoutProvider,
  };
}

async function ensureBeneficiary(provider, withdrawal, user, bankAccount) {
  const bankDetails = {
    accountHolderName: bankAccount.accountHolderName,
    accountNumber: decrypt(bankAccount.accountNumber, bankAccount.accountIv),
    ifscCode: decrypt(bankAccount.ifscCode, bankAccount.ifscIv),
  };
  const fingerprint = crypto
    .createHmac(
      "sha256",
      process.env.PAYOUT_FINGERPRINT_SECRET || process.env.ENCRYPTION_SECRET,
    )
    .update(`${bankDetails.accountNumber}|${bankDetails.ifscCode}`)
    .digest("hex");
  const providerName = withdrawal.payoutProvider;
  const entries = bankAccount.providerBeneficiaries || [];
  const stored =
    entries.find(
      (entry) =>
        entry.provider === providerName &&
        entry.accountFingerprint === fingerprint,
    ) ||
    (providerName === PAYOUT_PROVIDER.RAZORPAYX &&
    bankAccount.payoutFundAccountId
      ? { beneficiaryId: bankAccount.payoutFundAccountId }
      : {});
  const existing = {
    ...stored,
    contactId:
      stored.providerData?.contactId ||
      (providerName === PAYOUT_PROVIDER.RAZORPAYX
        ? user.payoutContactId
        : null),
  };
  const beneficiary = await provider.createBeneficiary({
    user,
    bankAccount,
    bankDetails,
    existing,
  });
  if (!beneficiary?.beneficiaryId)
    throw new Error(PAYOUT_MESSAGE.PROVIDER_BENEFICIARY_MISSING(providerName));
  await UserBankAccount.updateOne(
    { _id: bankAccount._id },
    {
      $addToSet: {
        providerBeneficiaries: {
          provider: providerName,
          beneficiaryId: beneficiary.beneficiaryId,
          providerData: beneficiary.providerData || {},
          accountFingerprint: fingerprint,
        },
      },
      ...(providerName === PAYOUT_PROVIDER.RAZORPAYX
        ? { $set: { payoutFundAccountId: beneficiary.beneficiaryId } }
        : {}),
    },
  );
  if (
    providerName === PAYOUT_PROVIDER.RAZORPAYX &&
    beneficiary.providerData?.contactId &&
    !user.payoutContactId
  ) {
    await User.updateOne(
      { _id: user._id, payoutContactId: null },
      { $set: { payoutContactId: beneficiary.providerData.contactId } },
    );
  }
  return beneficiary;
}

async function recordReconciliation(
  withdrawal,
  provider,
  result,
  outcome,
  errorMessage = null,
) {
  return PayoutRecon.create({
    withdrawalId: withdrawal._id,
    provider: withdrawal.payoutProvider,
    providerTransferId: result?.providerTransferId || null,
    payoutId: result?.providerTransferId || null,
    providerReferenceId: withdrawal.providerReferenceId,
    referenceId: withdrawal.providerReferenceId,
    requestedAt: new Date(),
    outcome,
    providerStatus: result?.rawStatus || result?.status || null,
    providerResponse: result?.safeResponse || {},
    errorMessage: errorMessage ? safeText(errorMessage) : null,
  });
}

async function submitOrReconcile(outbox) {
  const withdrawal = await Withdrawal.findById(outbox.withdrawalId)
    .populate("userId")
    .populate("bankAccountId")
    .lean();
  if (!withdrawal || withdrawal.status !== WITHDRAWAL_STATUS.PROCESSING) {
    await PayoutOutbox.updateOne(
      { _id: outbox._id },
      {
        $set: {
          status: OUTBOX.FAILED,
          lastError: PAYOUT_MESSAGE.WITHDRAWAL_NO_LONGER_PROCESSING,
          processedAt: new Date(),
        },
      },
    );
    return;
  }
  const provider = getProvider(outbox.provider);
  if (
    withdrawal.payoutProvider !== outbox.provider ||
    withdrawal.providerReferenceId !== outbox.providerReferenceId
  ) {
    throw new Error(PAYOUT_MESSAGE.OUTBOX_WITHDRAWAL_MISMATCH);
  }
  const existingTransfer = await provider.getTransferStatus({
    referenceId: outbox.providerReferenceId,
  });
  if (existingTransfer) {
    await recordReconciliation(
      withdrawal,
      provider,
      existingTransfer,
      PAYOUT_RECON_OUTCOME.MATCHED,
    );
    await applyTransferUpdate({
      withdrawal,
      provider: outbox.provider,
      normalized: existingTransfer,
      source: PAYOUT_SOURCE.PAYOUT_RECONCILIATION,
    });
    await PayoutOutbox.updateOne(
      { _id: outbox._id },
      {
        $set: {
          status: OUTBOX.SUBMITTED,
          lastProviderStatus:
            existingTransfer.rawStatus || existingTransfer.status,
          processedAt: new Date(),
          leaseExpiresAt: null,
        },
      },
    );
    return;
  }

  const beneficiary = await ensureBeneficiary(
    provider,
    withdrawal,
    withdrawal.userId,
    withdrawal.bankAccountId,
  );
  const requestStartedAt = new Date();
  const attemptSession = await mongoose.startSession();
  let attempt;
  try {
    await attemptSession.withTransaction(async () => {
      const claimedWithdrawal = await Withdrawal.findOneAndUpdate(
        {
          _id: withdrawal._id,
          status: WITHDRAWAL_STATUS.PROCESSING,
          payoutProvider: outbox.provider,
        },
        { $inc: { payoutAttemptCount: 1 } },
        { new: true, session: attemptSession },
      );
      if (!claimedWithdrawal)
        throw new Error(PAYOUT_MESSAGE.WITHDRAWAL_CHANGED_BEFORE_REQUEST);
      [attempt] = await PayoutAttempt.create(
        [
          {
            withdrawalId: withdrawal._id,
            attemptNumber: claimedWithdrawal.payoutAttemptCount,
            adminId: withdrawal.approvedBy || null,
            provider: outbox.provider,
            idempotencyKey: provider.createIdempotencyKey(
              outbox.providerReferenceId,
            ),
            referenceId: outbox.providerReferenceId,
            providerBeneficiaryId: beneficiary.beneficiaryId,
            fundAccountId: beneficiary.beneficiaryId,
            amountMinor: Math.round(
              withdrawal.cashAmount * PAYOUT_CONFIG.MINOR_UNITS_PER_INR,
            ),
            amount: Math.round(
              withdrawal.cashAmount * PAYOUT_CONFIG.MINOR_UNITS_PER_INR,
            ),
            currency: PAYOUT_CURRENCY.INR,
            mode: PAYOUT_TRANSFER_MODE.IMPS,
            narration:
              `${PAYOUT_MESSAGE.NARRATION_PREFIX} ${withdrawal.cashAmount}`
                .replace(/[^a-zA-Z0-9 ]/g, "")
                .slice(0, PAYOUT_CONFIG.MAX_NARRATION_LENGTH),
            requestStartedAt,
            outcome: ATTEMPT.REQUESTED,
          },
        ],
        { session: attemptSession },
      );
    });
  } finally {
    await attemptSession.endSession();
  }
  try {
    const result = await provider.initiateTransfer({
      beneficiaryId: beneficiary.beneficiaryId,
      amountMinor: Math.round(
        withdrawal.cashAmount * PAYOUT_CONFIG.MINOR_UNITS_PER_INR,
      ),
      currency: PAYOUT_CURRENCY.INR,
      mode: PAYOUT_TRANSFER_MODE.IMPS,
      narration: `${PAYOUT_MESSAGE.NARRATION_PREFIX} ${withdrawal.cashAmount}`
        .replace(/[^a-zA-Z0-9 ]/g, "")
        .slice(0, PAYOUT_CONFIG.MAX_NARRATION_LENGTH),
      referenceId: outbox.providerReferenceId,
      idempotencyKey: attempt.idempotencyKey,
    });
    const responseReceivedAt = new Date();
    await PayoutAttempt.updateOne(
      { _id: attempt._id },
      {
        $set: {
          outcome: result.providerTransferId
            ? ATTEMPT.SUCCEEDED
            : ATTEMPT.AMBIGUOUS_FAILURE,
          providerTransferId: result.providerTransferId || null,
          payoutId: result.providerTransferId || null,
          providerStatus: result.rawStatus || result.status || null,
          providerResponse: result.safeResponse || {},
          responseReceivedAt,
          durationMs: responseReceivedAt - requestStartedAt,
        },
      },
    );
    if (result.providerTransferId) {
      await Withdrawal.updateOne(
        { _id: withdrawal._id },
        { $set: { providerTransferId: result.providerTransferId } },
      );
      await PayoutOutbox.updateOne(
        { _id: outbox._id },
        {
          $set: {
            status: OUTBOX.SUBMITTED,
            lastProviderStatus: result.rawStatus || result.status || null,
            processedAt: new Date(),
            leaseExpiresAt: null,
          },
        },
      );
      if (result.targetStatus)
        await applyTransferUpdate({
          withdrawal,
          provider: outbox.provider,
          normalized: result,
          source: PAYOUT_SOURCE.PAYOUT_RECONCILIATION,
        });
    } else {
      await PayoutOutbox.updateOne(
        { _id: outbox._id },
        {
          $set: {
            status: OUTBOX.RECONCILIATION_REQUIRED,
            lastError: PAYOUT_MESSAGE.TRANSFER_ID_MISSING,
            availableAt: new Date(
              Date.now() + PAYOUT_CONFIG.OUTBOX_RETRY_BASE_MS,
            ),
            leaseExpiresAt: null,
          },
        },
      );
    }
  } catch (error) {
    const definitive = error.definitive === true;
    const completedAt = new Date();
    await PayoutAttempt.updateOne(
      { _id: attempt._id },
      {
        $set: {
          outcome: definitive
            ? ATTEMPT.DEFINITIVE_FAILURE
            : ATTEMPT.AMBIGUOUS_FAILURE,
          httpStatus: error.providerStatusCode || null,
          providerErrorCode: error.providerErrorCode || null,
          providerErrorDescription: safeText(error.message),
          responseReceivedAt: completedAt,
          durationMs: completedAt - requestStartedAt,
        },
      },
    );
    await PayoutOutbox.updateOne(
      { _id: outbox._id },
      {
        $set: {
          status: definitive ? OUTBOX.FAILED : OUTBOX.RECONCILIATION_REQUIRED,
          lastError: safeText(error.message),
          ...(definitive
            ? {}
            : {
                availableAt: new Date(
                  Date.now() +
                    Math.min(
                      PAYOUT_CONFIG.OUTBOX_RETRY_MAX_MS,
                      PAYOUT_CONFIG.OUTBOX_RETRY_BASE_MS *
                        2 **
                          Math.min(
                            outbox.attempts || 0,
                            PAYOUT_CONFIG.OUTBOX_RETRY_EXPONENT_LIMIT,
                          ),
                    ),
                ),
              }),
          leaseExpiresAt: null,
        },
      },
    );
    if (definitive) {
      await Withdrawal.updateOne(
        {
          _id: withdrawal._id,
          status: WITHDRAWAL_STATUS.PROCESSING,
          providerTransferId: null,
        },
        {
          $set: {
            status: WITHDRAWAL_STATUS.PENDING,
            approvedBy: null,
            approvedAt: null,
          },
        },
      );
    }
    logger.error(PAYOUT_MESSAGE.TRANSFER_SUBMISSION_LOG, {
      withdrawalId: String(withdrawal._id),
      provider: outbox.provider,
      definitive,
      error: safeText(error.message),
    });
  }
}

async function processPayoutOutboxBatch(
  limit = PAYOUT_CONFIG.OUTBOX_BATCH_SIZE,
) {
  for (let i = 0; i < limit; i += 1) {
    const now = new Date();
    const record = await PayoutOutbox.findOneAndUpdate(
      {
        status: {
          $in: [
            OUTBOX.PENDING,
            OUTBOX.RETRY,
            OUTBOX.RECONCILIATION_REQUIRED,
            OUTBOX.PROCESSING,
          ],
        },
        availableAt: { $lte: now },
        $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lte: now } }],
      },
      {
        $set: {
          status: OUTBOX.PROCESSING,
          leaseExpiresAt: new Date(
            now.getTime() + PAYOUT_CONFIG.OUTBOX_LEASE_MS,
          ),
        },
        $inc: { attempts: 1 },
      },
      { new: true, sort: { availableAt: 1 } },
    );
    if (!record) break;
    try {
      await submitOrReconcile(record);
    } catch (error) {
      const backoffMs = Math.min(
        PAYOUT_CONFIG.OUTBOX_RETRY_MAX_MS,
        PAYOUT_CONFIG.OUTBOX_RETRY_BASE_MS *
          2 **
            Math.min(
              record.attempts,
              PAYOUT_CONFIG.OUTBOX_RETRY_EXPONENT_LIMIT,
            ),
      );
      await PayoutOutbox.updateOne(
        { _id: record._id },
        {
          $set: {
            status: OUTBOX.RECONCILIATION_REQUIRED,
            lastError: safeText(error.message),
            availableAt: new Date(Date.now() + backoffMs),
            leaseExpiresAt: null,
          },
        },
      );
      logger.error(PAYOUT_MESSAGE.OUTBOX_PROCESSING_LOG, {
        withdrawalId: String(record.withdrawalId),
        provider: record.provider,
        error: safeText(error.message),
      });
    }
  }
}

module.exports = { enqueueApprovedWithdrawal, processPayoutOutboxBatch };

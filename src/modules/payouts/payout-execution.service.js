const crypto = require("crypto");
const mongoose = require("mongoose");
const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");
const { KYC_STATUS } = require("../../constants/user");
const {
  PAYOUT_PROVIDER,
  PAYOUT_METHOD,
  PAYOUT_BENEFICIARY_STATUS,
  PAYOUT_APPROVAL_SOURCE,
  PAYOUT_OUTBOX_STATUS: OUTBOX,
  PAYOUT_ATTEMPT_OUTCOME: ATTEMPT,
  PAYOUT_CURRENCY,
  PAYOUT_TRANSFER_MODE,
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
  PAYOUT_HTTP_STATUS,
  PAYOUT_SOURCE,
  PAYOUT_RECON_OUTCOME,
  PAYOUT_OPERATION,
  PAYOUT_ALERT_TYPE,
  PAYOUT_ALERT_SEVERITY,
} = require("../../constants/payouts");
const Withdrawal = require("../../schemas/withdrawal.schema");
const User = require("../../schemas/user.schema");
const UserBankAccount = require("../../schemas/user-bank-account.schema");
const PayoutAttempt = require("../../schemas/payout-attempt.schema");
const PayoutOutbox = require("../../schemas/payout-outbox.schema");
const PayoutRecon = require("../../schemas/payout-recon.schema");
const AppConfig = require("../../schemas/app-config.schema");
const {
  createOrUpdatePayoutRecord,
  syncPayoutRecord,
} = require("./payout-record.service");
const { getProvider, currentProviderName } = require("../../functions/payouts");
const { decrypt } = require("../../utils/encryption");
const {
  applyTransferUpdate,
  loadPendingManualPayout,
} = require("./payout-state.service");
const { safeText } = require("./payout-utils");
const { sendFailResponse } = require("../../utils/responseHandlers");
const logger = require("../../config/pino.config");
const { reportPayoutAlert } = require("./payout-alerts");

async function enqueueApprovedWithdrawal(
  adminId,
  withdrawalId,
  approvalSource = PAYOUT_APPROVAL_SOURCE.ADMIN,
  requestedPayoutMethod = null,
) {
  const session = await mongoose.startSession();
  let withdrawal;
  try {
    await session.withTransaction(async () => {
      withdrawal = await Withdrawal.findOne({
        _id: withdrawalId,
        status: WITHDRAWAL_STATUS.PENDING,
      }).session(session);
      if (!withdrawal) return;
      const user = await User.findById(withdrawal.userId).session(session);
      if (!user || user.kycStatus !== KYC_STATUS.APPROVED) {
        throw new Error(PAYOUT_MESSAGE.KYC_REQUIRED);
      }
      if (
        approvalSource === PAYOUT_APPROVAL_SOURCE.AUTO &&
        !user.enableAutoPayout
      ) {
        throw new Error(PAYOUT_MESSAGE.AUTO_PAYOUT_DISABLED);
      }
      let payoutMethod = requestedPayoutMethod;
      if (!payoutMethod) {
        const configured = await AppConfig.findOne()
          .select("payoutSettings.defaultPayoutMethod")
          .session(session)
          .lean();
        payoutMethod =
          configured?.payoutSettings?.defaultPayoutMethod ||
          PAYOUT_METHOD.PROVIDER;
      }
      const isManualPayout = payoutMethod === PAYOUT_METHOD.MANUAL;
      const provider = isManualPayout
        ? PAYOUT_PROVIDER.MANUAL
        : withdrawal.payoutProvider || currentProviderName();
      if (!isManualPayout) getProvider(provider).validateConfig?.();
      const referenceId =
        withdrawal.providerReferenceId || String(withdrawal._id);
      withdrawal.status = WITHDRAWAL_STATUS.PROCESSING;
      withdrawal.payoutProvider = provider;
      withdrawal.payoutMethod = payoutMethod;
      withdrawal.isManualPayout = isManualPayout;
      withdrawal.createdByAdminId = adminId || null;
      withdrawal.payoutBatchId = null;
      withdrawal.providerReferenceId = referenceId;
      withdrawal.approvedBy = adminId;
      withdrawal.approvedAt = new Date();
      withdrawal.approvalSource = approvalSource;
      await withdrawal.save({ session });
      await createOrUpdatePayoutRecord({
        withdrawal,
        approval: {
          status: isManualPayout
            ? WITHDRAWAL_STATUS.PENDING
            : WITHDRAWAL_STATUS.PROCESSING,
          provider,
          payoutMethod,
          isManualPayout,
          createdByAdminId: adminId || null,
          providerReferenceId: referenceId,
          adminId,
          approvalSource,
          approvedAt: withdrawal.approvedAt,
        },
        session,
      });
      if (!isManualPayout) {
        await PayoutOutbox.findOneAndUpdate(
          { withdrawalId: withdrawal._id },
          {
            $set: {
              provider,
              providerReferenceId: referenceId,
              executionBatchId: null,
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
      }
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
    payoutMethod: withdrawal.payoutMethod,
    isManualPayout: withdrawal.isManualPayout,
    shouldWakeWorker: !withdrawal.isManualPayout,
  };
}

async function ensureBeneficiary(provider, withdrawal, user, bankAccount) {
  const bankDetails = decryptBankDetails(bankAccount);
  const fingerprint = fingerprintBankAccount(bankDetails);
  const providerName = withdrawal.payoutProvider;
  const existing = findExistingBeneficiary(
    bankAccount,
    providerName,
    fingerprint,
    user,
  );
  if (existing.beneficiaryId && provider.getBeneficiaryStatus) {
    const status = await provider.getBeneficiaryStatus({
      beneficiaryId: existing.beneficiaryId,
    });
    if (status !== PAYOUT_BENEFICIARY_STATUS.UNKNOWN) {
      const beneficiary = { ...existing, status };
      await saveBeneficiary({
        bankAccount,
        user,
        providerName,
        fingerprint,
        beneficiary,
      });
      return beneficiary;
    }
  }
  const beneficiary = await provider.createBeneficiary({
    user,
    bankAccount,
    bankDetails,
    existing,
  });
  if (!beneficiary?.beneficiaryId)
    throw new Error(PAYOUT_MESSAGE.PROVIDER_BENEFICIARY_MISSING(providerName));
  await saveBeneficiary({
    bankAccount,
    user,
    providerName,
    fingerprint,
    beneficiary,
  });
  return beneficiary;
}

function decryptBankDetails(bankAccount) {
  return {
    accountHolderName: bankAccount.accountHolderName,
    accountNumber: decrypt(bankAccount.accountNumber, bankAccount.accountIv),
    ifscCode: decrypt(bankAccount.ifscCode, bankAccount.ifscIv),
  };
}

function fingerprintBankAccount(bankDetails) {
  return crypto
    .createHmac(
      "sha256",
      process.env.PAYOUT_FINGERPRINT_SECRET || process.env.ENCRYPTION_SECRET,
    )
    .update(`${bankDetails.accountNumber}|${bankDetails.ifscCode}`)
    .digest("hex");
}

function findExistingBeneficiary(bankAccount, providerName, fingerprint, user) {
  const stored = (bankAccount.providerBeneficiaries || []).find(
    (entry) =>
      entry.provider === providerName &&
      entry.accountFingerprint === fingerprint,
  );
  const legacyRazorpayAccount =
    providerName === PAYOUT_PROVIDER.RAZORPAYX &&
    bankAccount.payoutFundAccountId
      ? { beneficiaryId: bankAccount.payoutFundAccountId }
      : {};
  const existing = stored || legacyRazorpayAccount;
  return {
    ...existing,
    contactId:
      existing.providerData?.contactId ||
      (providerName === PAYOUT_PROVIDER.RAZORPAYX
        ? user.payoutContactId
        : null),
  };
}

async function saveBeneficiary({
  bankAccount,
  user,
  providerName,
  fingerprint,
  beneficiary,
}) {
  const beneficiaryStatus =
    beneficiary.status || PAYOUT_BENEFICIARY_STATUS.UNKNOWN;
  const beneficiaryUpdate = {
    "providerBeneficiaries.$[beneficiary].beneficiaryId":
      beneficiary.beneficiaryId,
    "providerBeneficiaries.$[beneficiary].providerData":
      beneficiary.providerData || {},
    "providerBeneficiaries.$[beneficiary].status": beneficiaryStatus,
    "providerBeneficiaries.$[beneficiary].statusCheckedAt": new Date(),
    ...(providerName === PAYOUT_PROVIDER.RAZORPAYX
      ? { payoutFundAccountId: beneficiary.beneficiaryId }
      : {}),
  };
  const existingResult = await UserBankAccount.updateOne(
    {
      _id: bankAccount._id,
      providerBeneficiaries: {
        $elemMatch: { provider: providerName, accountFingerprint: fingerprint },
      },
    },
    {
      $set: beneficiaryUpdate,
    },
    {
      arrayFilters: [
        {
          "beneficiary.provider": providerName,
          "beneficiary.accountFingerprint": fingerprint,
        },
      ],
    },
  );
  if (!existingResult.matchedCount) {
    await UserBankAccount.updateOne(
      { _id: bankAccount._id },
      {
        $push: {
          providerBeneficiaries: {
            provider: providerName,
            beneficiaryId: beneficiary.beneficiaryId,
            providerData: beneficiary.providerData || {},
            accountFingerprint: fingerprint,
            status: beneficiaryStatus,
            statusCheckedAt: new Date(),
          },
        },
        ...(providerName === PAYOUT_PROVIDER.RAZORPAYX
          ? { $set: { payoutFundAccountId: beneficiary.beneficiaryId } }
          : {}),
      },
    );
  }
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
}

// Creates or resolves the active provider beneficiary when bank details are saved.
async function registerBankAccountBeneficiary({ userId, bankAccountId }) {
  const [user, bankAccount] = await Promise.all([
    User.findById(userId).lean(),
    UserBankAccount.findOne({ _id: bankAccountId, userId }).lean(),
  ]);
  if (!user || !bankAccount) {
    throw new Error(PAYOUT_MESSAGE.USER_OR_BANK_MISSING);
  }
  const providerName = currentProviderName();
  const provider = getProvider(providerName);
  provider.validateConfig?.();
  return ensureBeneficiary(
    provider,
    { payoutProvider: providerName },
    user,
    bankAccount,
  );
}

// Refreshes the current provider state and requires a payout-ready beneficiary.
async function getVerifiedBankAccountBeneficiary({ user, bankAccount }) {
  const providerName = currentProviderName();
  const provider = getProvider(providerName);
  const beneficiary = await ensureBeneficiary(
    provider,
    { payoutProvider: providerName },
    user,
    bankAccount,
  );
  if (beneficiary.status !== PAYOUT_BENEFICIARY_STATUS.READY) {
    throw new Error(PAYOUT_MESSAGE.BENEFICIARY_NOT_READY);
  }
  return beneficiary;
}

function amountInMinorUnits(withdrawal) {
  return Math.round(withdrawal.cashAmount * PAYOUT_CONFIG.MINOR_UNITS_PER_INR);
}

function payoutNarration(withdrawal) {
  return `${PAYOUT_MESSAGE.NARRATION_PREFIX} ${withdrawal.cashAmount}`
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .slice(0, PAYOUT_CONFIG.MAX_NARRATION_LENGTH);
}

async function loadProcessingWithdrawal(outbox) {
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
    return null;
  }
  return withdrawal;
}

function assertOutboxMatchesWithdrawal(outbox, withdrawal) {
  if (
    withdrawal.payoutProvider !== outbox.provider ||
    withdrawal.providerReferenceId !== outbox.providerReferenceId
  ) {
    throw new Error(PAYOUT_MESSAGE.OUTBOX_WITHDRAWAL_MISMATCH);
  }
}

async function markOutboxSubmitted(outbox, transfer) {
  await PayoutOutbox.updateOne(
    { _id: outbox._id },
    {
      $set: {
        status: OUTBOX.SUBMITTED,
        lastProviderStatus: transfer.rawStatus || transfer.status,
        processedAt: new Date(),
        leaseExpiresAt: null,
      },
    },
  );
}

async function reconcileExistingTransfer(outbox, withdrawal, transfer) {
  await recordPayoutReconciliation({
    withdrawal,
    outcome: PAYOUT_RECON_OUTCOME.MATCHED,
    transfer,
  });
  await applyTransferUpdate({
    withdrawal,
    provider: outbox.provider,
    normalized: transfer,
    source: PAYOUT_SOURCE.PAYOUT_RECONCILIATION,
  });
  await markOutboxSubmitted(outbox, transfer);
}

async function createPayoutAttempt({
  outbox,
  withdrawal,
  provider,
  beneficiary,
  requestStartedAt,
}) {
  const session = await mongoose.startSession();
  let attempt;
  try {
    await session.withTransaction(async () => {
      const claimedWithdrawal = await Withdrawal.findOneAndUpdate(
        {
          _id: withdrawal._id,
          status: WITHDRAWAL_STATUS.PROCESSING,
          payoutProvider: outbox.provider,
        },
        { $inc: { payoutAttemptCount: 1 } },
        { new: true, session },
      );
      if (!claimedWithdrawal) {
        throw new Error(PAYOUT_MESSAGE.WITHDRAWAL_CHANGED_BEFORE_REQUEST);
      }

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
            amountMinor: amountInMinorUnits(withdrawal),
            amount: amountInMinorUnits(withdrawal),
            currency: PAYOUT_CURRENCY.INR,
            mode: PAYOUT_TRANSFER_MODE.IMPS,
            narration: payoutNarration(withdrawal),
            requestStartedAt,
            outcome: ATTEMPT.REQUESTED,
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  return attempt;
}

async function initiateProviderTransfer({
  outbox,
  withdrawal,
  provider,
  beneficiary,
  attempt,
  requestStartedAt,
}) {
  const result = await provider.initiateTransfer({
    beneficiaryId: beneficiary.beneficiaryId,
    amountMinor: amountInMinorUnits(withdrawal),
    currency: PAYOUT_CURRENCY.INR,
    mode: PAYOUT_TRANSFER_MODE.IMPS,
    narration: payoutNarration(withdrawal),
    referenceId: outbox.providerReferenceId,
    idempotencyKey: attempt.idempotencyKey,
  });
  await recordTransferResponse({
    outbox,
    withdrawal,
    result,
    attempt,
    requestStartedAt,
  });
}

async function recordTransferResponse({
  outbox,
  withdrawal,
  result,
  attempt,
  requestStartedAt,
}) {
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

  if (!result.providerTransferId) {
    await requireReconciliation(outbox, PAYOUT_MESSAGE.TRANSFER_ID_MISSING);
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Withdrawal.updateOne(
        { _id: withdrawal._id },
        { $set: { providerTransferId: result.providerTransferId } },
        { session },
      );
      await syncPayoutRecord(
        withdrawal._id,
        { providerTransferId: result.providerTransferId },
        session,
      );
    });
  } finally {
    await session.endSession();
  }
  await markOutboxSubmitted(outbox, result);
  if (result.targetStatus) {
    await applyTransferUpdate({
      withdrawal,
      provider: outbox.provider,
      normalized: result,
      source: PAYOUT_SOURCE.PAYOUT_RECONCILIATION,
    });
  }
}

async function requireReconciliation(outbox, reason) {
  await PayoutOutbox.updateOne(
    { _id: outbox._id },
    {
      $set: {
        status: OUTBOX.RECONCILIATION_REQUIRED,
        lastError: reason,
        availableAt: new Date(Date.now() + PAYOUT_CONFIG.OUTBOX_RETRY_BASE_MS),
        leaseExpiresAt: null,
      },
    },
  );
}

async function handleTransferFailure({
  error,
  outbox,
  withdrawal,
  attempt,
  requestStartedAt,
}) {
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

  const outboxUpdate = {
    status: definitive ? OUTBOX.FAILED : OUTBOX.RECONCILIATION_REQUIRED,
    lastError: safeText(error.message),
    leaseExpiresAt: null,
  };
  if (definitive) {
    outboxUpdate.processedAt = completedAt;
    await PayoutOutbox.updateOne({ _id: outbox._id }, { $set: outboxUpdate });
    await releaseWithdrawalForRetry(withdrawal);
  } else {
    error.payoutOperation = PAYOUT_OPERATION.TRANSFER_SUBMISSION;
    await scheduleOutboxRetry(outbox, error);
  }
  logger.error(PAYOUT_MESSAGE.TRANSFER_SUBMISSION_LOG, {
    withdrawalId: String(withdrawal._id),
    provider: outbox.provider,
    definitive,
    error: safeText(error.message),
  });
}

async function releaseWithdrawalForRetry(withdrawal) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const result = await Withdrawal.updateOne(
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
        { session },
      );
      if (result.modifiedCount) {
        await syncPayoutRecord(
          withdrawal._id,
          { status: WITHDRAWAL_STATUS.PENDING },
          session,
        );
      }
    });
  } finally {
    await session.endSession();
  }
}

async function submitOrReconcile(outbox) {
  const withdrawal = await loadProcessingWithdrawal(outbox);
  if (!withdrawal) return;

  const provider = getProvider(outbox.provider);
  assertOutboxMatchesWithdrawal(outbox, withdrawal);
  let existingTransfer;
  try {
    existingTransfer = await provider.getTransferStatus({
      referenceId: outbox.providerReferenceId,
    });
  } catch (error) {
    error.payoutOperation = PAYOUT_OPERATION.TRANSFER_STATUS_LOOKUP;
    throw error;
  }
  if (existingTransfer) {
    try {
      await reconcileExistingTransfer(outbox, withdrawal, existingTransfer);
    } catch (error) {
      error.payoutOperation = PAYOUT_OPERATION.TRANSFER_RECONCILIATION;
      throw error;
    }
    return;
  }

  let beneficiary;
  try {
    beneficiary = await ensureBeneficiary(
      provider,
      withdrawal,
      withdrawal.userId,
      withdrawal.bankAccountId,
    );
  } catch (error) {
    error.payoutOperation = PAYOUT_OPERATION.BENEFICIARY_SETUP;
    throw error;
  }
  if (beneficiary.status !== PAYOUT_BENEFICIARY_STATUS.READY) {
    const error = new Error(PAYOUT_MESSAGE.BENEFICIARY_NOT_READY);
    error.payoutOperation = PAYOUT_OPERATION.BENEFICIARY_SETUP;
    throw error;
  }
  const requestStartedAt = new Date();
  let attempt;
  try {
    attempt = await createPayoutAttempt({
      outbox,
      withdrawal,
      provider,
      beneficiary,
      requestStartedAt,
    });
  } catch (error) {
    error.payoutOperation = PAYOUT_OPERATION.TRANSFER_ATTEMPT_CREATION;
    throw error;
  }
  try {
    await initiateProviderTransfer({
      outbox,
      withdrawal,
      provider,
      beneficiary,
      attempt,
      requestStartedAt,
    });
  } catch (error) {
    await handleTransferFailure({
      error,
      outbox,
      withdrawal,
      attempt,
      requestStartedAt,
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
        executionBatchId: null,
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
      await scheduleOutboxRetry(record, error);
      logger.error(PAYOUT_MESSAGE.OUTBOX_PROCESSING_LOG, {
        withdrawalId: String(record.withdrawalId),
        provider: record.provider,
        error: safeText(error.message),
      });
    }
  }
}

function wakePayoutOutboxWorker() {
  processPayoutOutboxBatch(PAYOUT_CONFIG.OUTBOX_BATCH_SIZE).catch((error) => {
    logger.error(PAYOUT_MESSAGE.OUTBOX_WORKER_FAILED, {
      error: safeText(error.message),
    });
  });
}

function hasTransferMismatch(withdrawal, transfer) {
  const expectedAmount = Math.round(
    withdrawal.cashAmount * PAYOUT_CONFIG.MINOR_UNITS_PER_INR,
  );
  const referenceMismatch =
    transfer.providerReferenceId &&
    transfer.providerReferenceId !== withdrawal.providerReferenceId;
  const transferIdMismatch =
    transfer.providerTransferId &&
    withdrawal.providerTransferId &&
    transfer.providerTransferId !== withdrawal.providerTransferId;
  const amountMismatch =
    transfer.amountMinor != null &&
    Number(transfer.amountMinor) !== expectedAmount;
  const currencyMismatch =
    transfer.currency && transfer.currency !== PAYOUT_CURRENCY.INR;

  if (
    referenceMismatch ||
    transferIdMismatch ||
    amountMismatch ||
    currencyMismatch
  ) {
    return true;
  }
  return false;
}

async function recordPayoutReconciliation({
  withdrawal,
  requestedAt = new Date(),
  outcome,
  transfer = null,
  errorMessage = null,
  retryAttempt = null,
  operation = null,
  providerStatusCode = null,
  providerErrorCode = null,
  session = null,
}) {
  const [reconciliation] = await PayoutRecon.create(
    [
      {
        withdrawalId: withdrawal._id,
        provider: withdrawal.payoutProvider,
        providerTransferId: transfer?.providerTransferId || null,
        payoutId: transfer?.providerTransferId || null,
        providerReferenceId: withdrawal.providerReferenceId,
        referenceId: withdrawal.providerReferenceId,
        requestedAt,
        retryAttempt,
        operation,
        outcome,
        providerStatus: transfer?.rawStatus || transfer?.status || null,
        providerStatusCode,
        providerErrorCode: providerErrorCode
          ? safeText(providerErrorCode)
          : null,
        providerResponse: transfer?.safeResponse || {},
        errorMessage: errorMessage ? safeText(errorMessage) : null,
      },
    ],
    session ? { session } : undefined,
  );
  return reconciliation;
}

function retryDelay(attempts) {
  return Math.min(
    PAYOUT_CONFIG.OUTBOX_RETRY_MAX_MS,
    PAYOUT_CONFIG.OUTBOX_RETRY_BASE_MS *
      2 ** Math.min(attempts || 0, PAYOUT_CONFIG.OUTBOX_RETRY_EXPONENT_LIMIT),
  );
}

async function scheduleOutboxRetry(outbox, error) {
  const retryLimitReached =
    outbox.attempts >= PAYOUT_CONFIG.OUTBOX_MAX_ATTEMPTS;
  const now = new Date();
  const session = await mongoose.startSession();
  let withdrawal;

  try {
    await session.withTransaction(async () => {
      withdrawal = await Withdrawal.findById(outbox.withdrawalId)
        .select(
          "_id payoutProvider providerReferenceId providerTransferId payoutAttemptCount status cashAmount",
        )
        .session(session)
        .lean();

      if (withdrawal) {
        await recordPayoutReconciliation({
          withdrawal,
          requestedAt: now,
          outcome: PAYOUT_RECON_OUTCOME.ERROR,
          errorMessage: error.message,
          retryAttempt: outbox.attempts,
          operation:
            error.payoutOperation || PAYOUT_OPERATION.OUTBOX_PROCESSING,
          providerStatusCode: error.providerStatusCode || null,
          providerErrorCode: error.providerErrorCode || null,
          session,
        });
      }

      const update = {
        status: retryLimitReached
          ? OUTBOX.FAILED
          : OUTBOX.RECONCILIATION_REQUIRED,
        lastError: safeText(error.message),
        leaseExpiresAt: null,
        processedAt: now,
        retryExhaustedAt: null,
        manualReviewRequired: false,
      };
      if (retryLimitReached) {
        update.retryExhaustedAt = now;
        update.manualReviewRequired = true;
        update.availableAt = null;
      } else {
        update.availableAt = new Date(
          now.getTime() + retryDelay(outbox.attempts),
        );
      }
      await PayoutOutbox.updateOne(
        { _id: outbox._id, status: OUTBOX.PROCESSING },
        { $set: update },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  if (!retryLimitReached) return;

  const hasPossibleProviderTransfer =
    await hasPossibleProviderTransferAttempt(withdrawal);
  if (
    !hasPossibleProviderTransfer &&
    withdrawal?.status === WITHDRAWAL_STATUS.PROCESSING
  ) {
    await markWithdrawalFailedWhenTransferWasNeverSubmitted(outbox, withdrawal);
  }

  logger.error(PAYOUT_MESSAGE.OUTBOX_RETRIES_EXHAUSTED, {
    withdrawalId: String(outbox.withdrawalId),
    provider: outbox.provider,
    attempts: outbox.attempts,
    maxAttempts: PAYOUT_CONFIG.OUTBOX_MAX_ATTEMPTS,
    manualReviewRequired: hasPossibleProviderTransfer,
    error: safeText(error.message),
  });
  reportPayoutAlert({
    type: PAYOUT_ALERT_TYPE.RETRIES_EXHAUSTED,
    severity: PAYOUT_ALERT_SEVERITY.CRITICAL,
    summary: PAYOUT_MESSAGE.OUTBOX_RETRIES_EXHAUSTED,
    error,
    provider: outbox.provider,
    withdrawalId: String(outbox.withdrawalId),
    details: {
      attempts: outbox.attempts,
      maxAttempts: PAYOUT_CONFIG.OUTBOX_MAX_ATTEMPTS,
      lastOperation:
        error.payoutOperation || PAYOUT_OPERATION.OUTBOX_PROCESSING,
    },
  });
  if (hasPossibleProviderTransfer) {
    reportPayoutAlert({
      type: PAYOUT_ALERT_TYPE.MANUAL_REVIEW_REQUIRED,
      severity: PAYOUT_ALERT_SEVERITY.CRITICAL,
      summary: PAYOUT_MESSAGE.PAYOUT_MANUAL_REVIEW_REQUIRED,
      error,
      provider: outbox.provider,
      withdrawalId: String(outbox.withdrawalId),
      details: {
        attempts: outbox.attempts,
        maxAttempts: PAYOUT_CONFIG.OUTBOX_MAX_ATTEMPTS,
        lastOperation:
          error.payoutOperation || PAYOUT_OPERATION.OUTBOX_PROCESSING,
      },
    });
  }
}

async function hasPossibleProviderTransferAttempt(withdrawal) {
  if (!withdrawal || withdrawal.providerTransferId) return true;
  if (withdrawal.payoutAttemptCount !== 0) return true;

  const existingAttempt = await PayoutAttempt.findOne({
    withdrawalId: withdrawal._id,
  })
    .select("_id")
    .lean();
  return Boolean(existingAttempt);
}

/** Converts a pending manual payout to the configured provider and queues execution. */
async function convertManualPayoutToProvider(adminId, withdrawalId) {
  const provider = currentProviderName();
  getProvider(provider).validateConfig?.();
  const session = await mongoose.startSession();
  let referenceId;
  try {
    await session.withTransaction(async () => {
      const { withdrawal } = await loadPendingManualPayout(
        withdrawalId,
        session,
      );
      referenceId = withdrawal.providerReferenceId || String(withdrawal._id);
      const now = new Date();
      const update = {
        payoutProvider: provider,
        payoutMethod: PAYOUT_METHOD.PROVIDER,
        isManualPayout: false,
        providerReferenceId: referenceId,
      };
      const changed = await Withdrawal.updateOne(
        {
          _id: withdrawalId,
          status: WITHDRAWAL_STATUS.PROCESSING,
          isManualPayout: true,
        },
        { $set: update },
        { session },
      );
      if (!changed.modifiedCount) {
        sendFailResponse(
          PAYOUT_MESSAGE.MANUAL_PAYOUT_ONLY,
          PAYOUT_HTTP_STATUS.CONFLICT,
        );
      }
      await syncPayoutRecord(
        withdrawalId,
        {
          ...update,
          status: WITHDRAWAL_STATUS.PROCESSING,
          convertedToProviderByAdminId: adminId,
          convertedToProviderAt: now,
        },
        session,
      );
      await PayoutOutbox.findOneAndUpdate(
        { withdrawalId },
        {
          $set: {
            provider,
            providerReferenceId: referenceId,
            status: OUTBOX.PENDING,
            availableAt: now,
            lastError: null,
            leaseExpiresAt: null,
          },
          $setOnInsert: { withdrawalId },
        },
        { upsert: true, new: true, session, setDefaultsOnInsert: true },
      );
    });
  } finally {
    await session.endSession();
  }
  wakePayoutOutboxWorker();
  return {
    message: PAYOUT_MESSAGE.MANUAL_PAYOUT_PROVIDER_CONVERTED,
    manualPayoutConverted: true,
    data: {
      id: String(withdrawalId),
      payoutProvider: provider,
      providerReferenceId: referenceId,
    },
  };
}

async function markWithdrawalFailedWhenTransferWasNeverSubmitted(
  outbox,
  withdrawal,
) {
  try {
    const result = await applyTransferUpdate({
      withdrawal,
      provider: withdrawal.payoutProvider,
      normalized: {
        providerReferenceId: withdrawal.providerReferenceId,
        targetStatus: WITHDRAWAL_STATUS.FAILED,
        failureReason: PAYOUT_MESSAGE.OUTBOX_RETRIES_EXHAUSTED,
      },
      source: PAYOUT_SOURCE.PAYOUT_RECONCILIATION,
    });
    await PayoutOutbox.updateOne(
      { _id: outbox._id, status: OUTBOX.FAILED },
      {
        $set: {
          manualReviewRequired:
            result.payoutStatus !== WITHDRAWAL_STATUS.FAILED,
        },
      },
    );
  } catch (error) {
    logger.error(PAYOUT_MESSAGE.OUTBOX_RETRIES_EXHAUSTED, {
      withdrawalId: String(withdrawal._id),
      error: safeText(error.message),
    });
  }
}

module.exports = {
  enqueueApprovedWithdrawal,
  processPayoutOutboxBatch,
  wakePayoutOutboxWorker,
  convertManualPayoutToProvider,
  ensureBeneficiary,
  registerBankAccountBeneficiary,
  getVerifiedBankAccountBeneficiary,
  amountInMinorUnits,
  payoutNarration,
  hasTransferMismatch,
  recordPayoutReconciliation,
  scheduleOutboxRetry,
};

const mongoose = require("mongoose");
const {
  APP_NOTIFICATIONS,
  getNotification,
} = require("../../constants/notifications");
const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");
const {
  PAYOUT_ASSET,
  PAYOUT_CURRENCY,
  PAYOUT_FAILURE_TERMINAL_STATUSES,
  PAYOUT_LEDGER_MOVEMENT,
  PAYOUT_LEDGER_SOURCE,
  PAYOUT_HTTP_STATUS,
  PAYOUT_MESSAGE,
  PAYOUT_CONFIG,
  PAYOUT_BATCH_STATUS,
} = require("../../constants/payouts");
const {
  POINTS_TRANSACTION_TYPE,
  POINTS_TRANSACTION_REASON,
} = require("../../constants/points");
const Withdrawal = require("../../schemas/withdrawal.schema");
const UserBankAccount = require("../../schemas/user-bank-account.schema");
const User = require("../../schemas/user.schema");
const AppConfig = require("../../schemas/app-config.schema");
const LedgerEntry = require("../../schemas/ledger-entry.schema");
const PointsLedger = require("../../schemas/points-ledger.schema");
const PayoutAttempt = require("../../schemas/payout-attempt.schema");
const PayoutEvent = require("../../schemas/payout-event.schema");
const PayoutRecon = require("../../schemas/payout-recon.schema");
const PayoutOutbox = require("../../schemas/payout-outbox.schema");
const PayoutBatch = require("../../schemas/payout-batch.schema");
const { decrypt } = require("../../utils/encryption");
const { sendFcmNotifications } = require("../../functions/fcm");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { formatNotification } = require("../../utils/heplers");
const {
  enqueueApprovedWithdrawal,
  wakePayoutOutboxWorker,
} = require("../payouts/payout-execution.service");
const {
  enqueueApprovedWithdrawalBatch,
} = require("../payouts/payout-batch.service");
const logger = require("../../config/pino.config");

// Withdrawal request validation, persistence, ledgering, and notifications.
function validateWithdrawalAmount(cashAmount) {
  const amount = Number(cashAmount);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(Math.round(amount * 100)) ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7
  ) {
    sendFailResponse("Invalid withdrawal amount requested");
  }
  return amount;
}

async function getWithdrawalCoinConfig() {
  const appConfigList = await AppConfig.find().lean();
  const coinConfig = appConfigList[0]?.coinSettings;
  if (!coinConfig) {
    sendFailResponse("Failed to load coin configuration settings");
  }

  const cashPerPoint = Number(coinConfig.coinValue);
  if (!Number.isFinite(cashPerPoint) || cashPerPoint <= 0) {
    sendFailResponse("Invalid point-to-cash conversion value");
  }
  return { coinConfig, cashPerPoint };
}

async function getWithdrawalUserAndBankAccount(userId) {
  const user = await User.findById(userId);
  if (!user) {
    sendFailResponse("User not found");
  }

  // Validate active bank account configured
  const bankAccount = await UserBankAccount.findOne({
    userId,
    isActive: true,
  }).lean();
  if (!bankAccount) {
    sendFailResponse(
      "No active bank account configured. Please configure a bank account first.",
    );
  }
  return { user, bankAccount };
}

function validateWithdrawalLimits(amount, coinConfig) {
  if (amount < coinConfig.minWithdrawAmount) {
    sendFailResponse(
      `Amount is below the minimum withdrawal limit of ₹${coinConfig.minWithdrawAmount}`,
    );
  }
  if (amount > coinConfig.maxWithdrawAmount) {
    sendFailResponse(
      `Amount exceeds the maximum withdrawal limit of ₹${coinConfig.maxWithdrawAmount}`,
    );
  }
}

async function createWithdrawalRecord({
  userId,
  pointsAmount,
  amount,
  bankAccount,
  session,
}) {
  let withdrawal;
  await session.withTransaction(async () => {
    const [newWithdrawal] = await Withdrawal.create(
      [
        {
          userId,
          pointsAmount,
          cashAmount: amount,
          bankAccountId: bankAccount._id,
          status: WITHDRAWAL_STATUS.PENDING,
        },
      ],
      { session },
    );
    withdrawal = newWithdrawal;

    const userBeforeDebit = await User.findOneAndUpdate(
      { _id: userId, totalPoints: { $gte: pointsAmount } },
      { $inc: { totalPoints: -pointsAmount } },
      { new: false, session },
    );
    if (!userBeforeDebit) sendFailResponse("Insufficient points balance");

    await PointsLedger.create(
      [
        {
          userId,
          amount: pointsAmount,
          transactionType: POINTS_TRANSACTION_TYPE.DEBIT,
          reason: POINTS_TRANSACTION_REASON.WITHDRAWAL_TO_CASH,
          description: `Withdrawal request for ₹${amount}`,
          balance: userBeforeDebit.totalPoints - pointsAmount,
          metadata: { withdrawalId: String(withdrawal._id) },
        },
      ],
      { session },
    );

    await LedgerEntry.create(
      [
        {
          entryKey: `withdrawal:${withdrawal._id}:points-debit`,
          userId,
          withdrawalId: withdrawal._id,
          movement: PAYOUT_LEDGER_MOVEMENT.WITHDRAWAL_POINTS_DEBIT,
          asset: PAYOUT_ASSET.REWARD_POINT,
          amount: pointsAmount,
          balanceBefore: userBeforeDebit.totalPoints,
          balanceAfter: userBeforeDebit.totalPoints - pointsAmount,
          source: PAYOUT_LEDGER_SOURCE.USER_REQUEST,
        },
      ],
      { session },
    );
  });
  return withdrawal;
}

function logWithdrawalRequest({ withdrawal, userId, pointsAmount, amount }) {
  logger.info("Withdrawal requested and points debit ledgered", {
    withdrawalId: String(withdrawal._id),
    userId: String(userId),
    pointsAmount,
    cashAmount: amount,
    currency: PAYOUT_CURRENCY.INR,
  });
}

function notifyWithdrawalCreated(user, withdrawal, amount) {
  if (!user.fcmTokens?.length || !user.enableNotification) return;

  const localizedNotif = getNotification(
    APP_NOTIFICATIONS.withdraw.initiated,
    user.language,
  );
  sendFcmNotifications(
    user.fcmTokens,
    localizedNotif.title,
    formatNotification(localizedNotif.body, { amount }),
  ).catch((err) =>
    logger.error("FCM withdrawal initiated notification failed", {
      withdrawalId: String(withdrawal._id),
      error: err.message,
    }),
  );
}

function formatCreatedWithdrawal(withdrawal) {
  return {
    message: "Withdrawal request created successfully",
    data: {
      id: withdrawal._id,
      pointsAmount: withdrawal.pointsAmount,
      cashAmount: withdrawal.cashAmount,
      status: withdrawal.status,
      createdAt: withdrawal.createdAt,
    },
  };
}

async function createWithdrawal(userId, data) {
  const amount = validateWithdrawalAmount(data.cashAmount);
  const { coinConfig, cashPerPoint } = await getWithdrawalCoinConfig();
  const pointsAmount = Math.ceil(amount / cashPerPoint);
  const { user, bankAccount } = await getWithdrawalUserAndBankAccount(userId);

  // Cash withdrawals spend reward points; HydaconCoins remain separate.
  if ((user.totalPoints || 0) < pointsAmount) {
    sendFailResponse("Insufficient points balance");
  }
  validateWithdrawalLimits(amount, coinConfig);

  const session = await mongoose.startSession();
  try {
    const withdrawal = await createWithdrawalRecord({
      userId,
      pointsAmount,
      amount,
      bankAccount,
      session,
    });
    logWithdrawalRequest({ withdrawal, userId, pointsAmount, amount });
    notifyWithdrawalCreated(user, withdrawal, amount);
    return formatCreatedWithdrawal(withdrawal);
  } catch (error) {
    sendFailResponse(error.message || "Failed to create withdrawal request");
  } finally {
    await session.endSession();
  }
}

// Withdrawal history and admin list query helpers.
async function getWithdrawalHistory(userId, data = {}) {
  const { page = 1, limit = 10 } = data;
  const skip = (page - 1) * limit;

  const list = await Withdrawal.find({ userId })
    .populate("bankAccountId", "bankName branchName accountHolderName")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Withdrawal.countDocuments({ userId });
  const totalPages = Math.ceil(total / limit);

  return {
    withdrawals: list.map(formatUserWithdrawalHistoryItem),
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages,
  };
}

function formatUserWithdrawalHistoryItem(withdrawal) {
  return {
    ...withdrawal,
    id: withdrawal._id,
    bankName: withdrawal.bankAccountId?.bankName,
    branchName: withdrawal.bankAccountId?.branchName,
    accountHolderName: withdrawal.bankAccountId?.accountHolderName,
  };
}

async function buildAdminWithdrawalQuery(search, status) {
  const query = {};
  if (status) query.status = status;
  if (!search) return query;

  const users = await User.find({
    $or: [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ],
  })
    .select("_id")
    .lean();

  query.$or = [
    { userId: { $in: users.map((user) => user._id) } },
    { providerTransferId: { $regex: search, $options: "i" } },
    { utr: { $regex: search, $options: "i" } },
  ];
  return query;
}

function buildWithdrawalSort(sortBy, sortOrder) {
  return { [sortBy]: sortOrder === "asc" ? 1 : -1 };
}

function formatAdminWithdrawalListItem(withdrawal) {
  return {
    ...withdrawal,
    id: withdrawal._id,
    user: withdrawal.userId,
    bank: withdrawal.bankAccountId,
  };
}

/**
 * Admin: List withdrawals with search, status filters, and pagination.
 */
async function listWithdrawals(data) {
  const {
    page = 1,
    limit = 10,
    search = "",
    status = "",
    sortBy = "createdAt",
    sortOrder = "desc",
  } = data;

  const skip = (page - 1) * limit;
  const query = await buildAdminWithdrawalQuery(search, status);
  const sort = buildWithdrawalSort(sortBy, sortOrder);

  const list = await Withdrawal.find(query)
    .populate("userId", "name email phone language")
    .populate("bankAccountId", "bankName branchName accountHolderName")
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Withdrawal.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  return {
    withdrawals: list.map(formatAdminWithdrawalListItem),
    total,
    page,
    limit,
    totalPages,
  };
}

// Withdrawal detail formatting and payout audit collection.
async function getWithdrawalDetailsUser(id, userId) {
  const withdrawal = await Withdrawal.findOne({ _id: id, userId })
    .populate("userId", "name email phone language payoutContactId")
    .populate("bankAccountId")
    .lean();

  if (!withdrawal) {
    sendFailResponse("Withdrawal request not found");
  }

  const decryptedBank = formatUserBankDetails(withdrawal.bankAccountId);

  return {
    ...withdrawal,
    id: withdrawal._id,
    user: withdrawal.userId,
    bankDetails: decryptedBank, // mapped to match transaction details expectation
    amount: withdrawal.cashAmount, // mapped to match transaction details expectation
  };
}

function decryptBankAccountNumbers(bankAccount) {
  return {
    accountNumber: decrypt(bankAccount.accountNumber, bankAccount.accountIv),
    ifscCode: decrypt(bankAccount.ifscCode, bankAccount.ifscIv),
  };
}

function formatUserBankDetails(bankAccount) {
  if (!bankAccount) return null;
  const { accountNumber, ifscCode } = decryptBankAccountNumbers(bankAccount);
  return {
    id: bankAccount._id,
    userName: bankAccount.accountHolderName,
    accountHolderName: bankAccount.accountHolderName,
    accountNumber,
    ifscCode,
    bankName: bankAccount.bankName,
    branchName: bankAccount.branchName,
  };
}

function formatAdminBankDetails(bankAccount) {
  if (!bankAccount) return null;
  const { accountNumber, ifscCode } = decryptBankAccountNumbers(bankAccount);
  return {
    id: bankAccount._id,
    accountHolderName: bankAccount.accountHolderName,
    accountNumber,
    ifscCode,
    bankName: bankAccount.bankName,
    branchName: bankAccount.branchName,
    payoutFundAccountId: bankAccount.payoutFundAccountId,
  };
}

async function loadAdminWithdrawalAudit(withdrawal) {
  const [
    financialLedger,
    payoutAttempts,
    webhookEvents,
    reconciliations,
    payoutOutbox,
    payoutBatch,
  ] = await Promise.all([
    LedgerEntry.find({ withdrawalId: withdrawal._id })
      .sort({ createdAt: 1 })
      .lean(),
    PayoutAttempt.find({ withdrawalId: withdrawal._id })
      .sort({ attemptNumber: 1 })
      .lean(),
    PayoutEvent.find({
      $or: [
        { referenceId: String(withdrawal._id) },
        ...(withdrawal.providerTransferId
          ? [{ providerTransferId: withdrawal.providerTransferId }]
          : []),
        ...(withdrawal.providerReferenceId
          ? [{ providerReferenceId: withdrawal.providerReferenceId }]
          : []),
      ],
    })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean(),
    PayoutRecon.find({ withdrawalId: withdrawal._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    PayoutOutbox.findOne({ withdrawalId: withdrawal._id })
      .select(
        "status attempts availableAt lastError retryExhaustedAt manualReviewRequired lastProviderStatus lastProviderStatusCode lastReconciliationOutcome",
      )
      .lean(),
    withdrawal.payoutBatchId
      ? PayoutBatch.findById(withdrawal.payoutBatchId)
          .select(
            "status consecutiveFailures availableAt lastError retryExhaustedAt",
          )
          .lean()
      : null,
  ]);

  return {
    financialLedger,
    payoutAttempts,
    webhookEvents,
    reconciliations,
    payoutOutbox,
    payoutBatch,
  };
}

function getLedgerAuditCoverage(withdrawal, financialLedger) {
  const ledgerKeys = new Set(financialLedger.map((entry) => entry.entryKey));
  const requiredLedgerKeys = [`withdrawal:${withdrawal._id}:coin-debit`];

  if (PAYOUT_FAILURE_TERMINAL_STATUSES.includes(withdrawal.status)) {
    requiredLedgerKeys.push(
      `withdrawal:${withdrawal._id}:coin-refund:${withdrawal.status.toLowerCase()}`,
    );
  }
  if (withdrawal.status === WITHDRAWAL_STATUS.COMPLETED) {
    requiredLedgerKeys.push(`withdrawal:${withdrawal._id}:payout-completed`);
  }
  if (
    withdrawal.status === WITHDRAWAL_STATUS.REVERSED &&
    ledgerKeys.has(`withdrawal:${withdrawal._id}:payout-completed`)
  ) {
    requiredLedgerKeys.push(`withdrawal:${withdrawal._id}:payout-reversed-inr`);
  }
  return requiredLedgerKeys.every((key) => ledgerKeys.has(key))
    ? "COMPLETE"
    : "INCOMPLETE_LEGACY_OR_MISSING_ENTRIES";
}

function getPayoutExecutionDetails(payoutOutbox, payoutBatch) {
  if (!payoutOutbox) return null;
  return {
    ...payoutOutbox,
    attempts: payoutBatch?.consecutiveFailures ?? payoutOutbox.attempts,
    availableAt: payoutBatch?.availableAt || payoutOutbox.availableAt,
    lastError: payoutBatch?.lastError || payoutOutbox.lastError,
    retryExhaustedAt:
      payoutBatch?.retryExhaustedAt || payoutOutbox.retryExhaustedAt,
    manualReviewRequired:
      payoutOutbox.manualReviewRequired ||
      payoutBatch?.status === PAYOUT_BATCH_STATUS.MANUAL_REVIEW,
    batchStatus: payoutBatch?.status || null,
    maxAttempts: PAYOUT_CONFIG.OUTBOX_MAX_ATTEMPTS,
  };
}

/**
 * Admin: Get detailed info of a single withdrawal.
 */
async function getWithdrawalDetails(id) {
  const withdrawal = await Withdrawal.findById(id)
    .populate("userId", "name email phone language payoutContactId")
    .populate("bankAccountId")
    .lean();

  if (!withdrawal) {
    sendFailResponse("Withdrawal request not found");
  }

  const auditData = await loadAdminWithdrawalAudit(withdrawal);
  const ledgerCoverage = getLedgerAuditCoverage(
    withdrawal,
    auditData.financialLedger,
  );

  const decryptedBank = formatAdminBankDetails(withdrawal.bankAccountId);

  return {
    ...withdrawal,
    id: withdrawal._id,
    user: withdrawal.userId,
    bankAccount: decryptedBank,
    payoutExecution: getPayoutExecutionDetails(
      auditData.payoutOutbox,
      auditData.payoutBatch,
    ),
    audit: {
      coverage: ledgerCoverage,
      financialLedger: auditData.financialLedger,
      payoutAttempts: auditData.payoutAttempts,
      webhookEvents: auditData.webhookEvents,
      reconciliations: auditData.reconciliations,
    },
  };
}

// Admin withdrawal actions.
async function getWithdrawalsSummary() {
  const summary = await Withdrawal.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const counts = {
    ALL: 0,
    [WITHDRAWAL_STATUS.PENDING]: 0,
    [WITHDRAWAL_STATUS.PROCESSING]: 0,
    [WITHDRAWAL_STATUS.COMPLETED]: 0,
    [WITHDRAWAL_STATUS.FAILED]: 0,
    [WITHDRAWAL_STATUS.CANCELLED]: 0,
    [WITHDRAWAL_STATUS.REVERSED]: 0,
  };

  let total = 0;
  summary.forEach((item) => {
    if (counts[item._id] !== undefined) {
      counts[item._id] = item.count;
    }
    total += item.count;
  });

  counts.ALL = total;
  return counts;
}

/**
 * Admin: Approves a withdrawal and transactionally enqueues provider execution.
 */
async function loadWithdrawalApprovalDetails(withdrawalId) {
  return Withdrawal.findById(withdrawalId)
    .populate("userId")
    .select("_id status cashAmount userId")
    .lean();
}

function notifyWithdrawalApproved(withdrawalId, user) {
  if (!user?.fcmTokens?.length || !user.enableNotification) return;

  const localizedNotif = getNotification(
    APP_NOTIFICATIONS.withdraw.approved,
    user.language,
  );
  sendFcmNotifications(
    user.fcmTokens,
    localizedNotif.title,
    localizedNotif.body,
  ).catch((err) =>
    logger.error(PAYOUT_MESSAGE.FCM_APPROVAL_LOG, {
      withdrawalId: String(withdrawalId),
      error: err.message,
    }),
  );
}

async function approveWithdrawal(adminId, withdrawalId) {
  let data;
  try {
    data = await enqueueApprovedWithdrawal(adminId, withdrawalId);
  } catch (error) {
    sendFailResponse(error.message || PAYOUT_MESSAGE.QUEUE_PAYOUT_FAILED);
  }
  wakePayoutOutboxWorker();
  const withdrawal = await loadWithdrawalApprovalDetails(withdrawalId);
  notifyWithdrawalApproved(withdrawalId, withdrawal?.userId);
  return {
    message: PAYOUT_MESSAGE.WITHDRAWAL_APPROVED_QUEUED,
    data: { ...data, status: withdrawal?.status || data.status },
  };
}

async function approveWithdrawalBatch(adminId, withdrawalIds) {
  let data;
  try {
    data = await enqueueApprovedWithdrawalBatch(adminId, withdrawalIds);
  } catch (error) {
    sendFailResponse(
      error.message || PAYOUT_MESSAGE.QUEUE_PAYOUT_FAILED,
      error.statusCode || PAYOUT_HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
  return {
    message: PAYOUT_MESSAGE.WITHDRAWAL_BATCH_APPROVED_QUEUED,
    withdrawalBatchApproved: true,
    data,
  };
}

function validateCancellationRemarks(remarks) {
  if (!remarks || remarks.trim().length < 5) {
    sendFailResponse(
      "A cancellation reason of at least 5 characters is required",
    );
  }
}

function validateCancellableWithdrawal(withdrawal) {
  if (!withdrawal) {
    sendFailResponse("Withdrawal request not found");
  }

  if (withdrawal.status !== WITHDRAWAL_STATUS.PENDING) {
    sendFailResponse("Only PENDING withdrawals can be approved");
  }

  const user = withdrawal.userId;
  if (!user) {
    sendFailResponse("User not found");
  }
  return user;
}

function getWithdrawalRefundDetails(withdrawal) {
  const refundsPoints = Number.isFinite(withdrawal.pointsAmount);
  return {
    refundsPoints,
    refundAmount: refundsPoints
      ? withdrawal.pointsAmount
      : withdrawal.coinAmount,
    balanceField: refundsPoints ? "totalPoints" : "hydaconCoins",
  };
}

async function applyWithdrawalCancellation({
  withdrawal,
  user,
  adminId,
  remarks,
  session,
}) {
  const { refundsPoints, refundAmount, balanceField } =
    getWithdrawalRefundDetails(withdrawal);
  const cancelled = await Withdrawal.updateOne(
    { _id: withdrawal._id, status: WITHDRAWAL_STATUS.PENDING },
    {
      $set: {
        status: WITHDRAWAL_STATUS.CANCELLED,
        remarks: remarks || "Cancelled by admin",
        approvedBy: adminId,
        approvedAt: new Date(),
      },
    },
    { session },
  );
  if (!cancelled.modifiedCount) {
    sendFailResponse("Withdrawal is no longer pending");
  }

  const userBeforeRefund = await User.findOneAndUpdate(
    { _id: user._id },
    { $inc: { [balanceField]: refundAmount } },
    { new: false, session },
  );
  if (!userBeforeRefund) sendFailResponse("User not found");

  const balanceBefore = userBeforeRefund[balanceField] || 0;
  const balanceAfter = balanceBefore + refundAmount;
  if (refundsPoints) {
    await writeCancelledPointsRefund({
      withdrawal,
      user,
      refundAmount,
      balanceAfter,
      session,
    });
  }
  await writeCancelledWithdrawalLedger({
    withdrawal,
    user,
    adminId,
    refundsPoints,
    refundAmount,
    balanceBefore,
    balanceAfter,
    session,
  });

  return { refundsPoints, refundAmount };
}

async function writeCancelledPointsRefund({
  withdrawal,
  user,
  refundAmount,
  balanceAfter,
  session,
}) {
  await PointsLedger.create(
    [
      {
        userId: user._id,
        amount: refundAmount,
        transactionType: POINTS_TRANSACTION_TYPE.CREDIT,
        reason: POINTS_TRANSACTION_REASON.REFUND,
        description: `Refund for cancelled withdrawal ${withdrawal._id}`,
        balance: balanceAfter,
        metadata: { withdrawalId: String(withdrawal._id) },
      },
    ],
    { session },
  );
}

async function writeCancelledWithdrawalLedger({
  withdrawal,
  user,
  adminId,
  refundsPoints,
  refundAmount,
  balanceBefore,
  balanceAfter,
  session,
}) {
  await LedgerEntry.create(
    [
      {
        entryKey: `withdrawal:${withdrawal._id}:${refundsPoints ? "points" : "coin"}-refund:cancelled`,
        userId: user._id,
        withdrawalId: withdrawal._id,
        movement: refundsPoints
          ? PAYOUT_LEDGER_MOVEMENT.WITHDRAWAL_POINTS_REFUND
          : PAYOUT_LEDGER_MOVEMENT.WITHDRAWAL_COIN_REFUND,
        asset: refundsPoints
          ? PAYOUT_ASSET.REWARD_POINT
          : PAYOUT_ASSET.HYDACON_COIN,
        amount: refundAmount,
        balanceBefore,
        balanceAfter,
        source: PAYOUT_LEDGER_SOURCE.ADMIN_CANCELLATION,
        sourceId: String(adminId),
      },
    ],
    { session },
  );
}

function logWithdrawalCancellation({
  withdrawal,
  user,
  adminId,
  refundsPoints,
  refundAmount,
}) {
  logger.info("Withdrawal cancelled and balance refund ledgered", {
    withdrawalId: String(withdrawal._id),
    userId: String(user._id),
    adminId: String(adminId),
    refundedAsset: refundsPoints
      ? PAYOUT_ASSET.REWARD_POINT
      : PAYOUT_ASSET.HYDACON_COIN,
    refundedAmount: refundAmount,
  });
}

function notifyWithdrawalCancelled(user, withdrawal) {
  if (!user.fcmTokens?.length || !user.enableNotification) return;

  const localizedNotif = getNotification(
    APP_NOTIFICATIONS.withdraw.cancelled,
    user.language,
  );
  sendFcmNotifications(
    user.fcmTokens,
    localizedNotif.title,
    localizedNotif.body,
  ).catch((err) =>
    logger.error("FCM withdrawal cancelled notification failed", {
      withdrawalId: String(withdrawal._id),
      error: err.message,
    }),
  );
}

function formatCancelledWithdrawal(withdrawal, refundsPoints) {
  return {
    message: "Withdrawal request cancelled and balance refunded successfully",
    data: {
      id: withdrawal._id,
      status: WITHDRAWAL_STATUS.CANCELLED,
      ...(refundsPoints
        ? { refundedPoints: withdrawal.pointsAmount }
        : { refundedCoins: withdrawal.coinAmount }),
    },
  };
}

/** Admin: Cancel a pending withdrawal and refund its debited balance. */
async function cancelWithdrawal(adminId, withdrawalId, data) {
  const { remarks } = data;
  validateCancellationRemarks(remarks);

  const withdrawal = await Withdrawal.findById(withdrawalId).populate("userId");
  const user = validateCancellableWithdrawal(withdrawal);
  const session = await mongoose.startSession();

  try {
    let refundDetails;
    await session.withTransaction(async () => {
      refundDetails = await applyWithdrawalCancellation({
        withdrawal,
        user,
        adminId,
        remarks,
        session,
      });
    });
    logWithdrawalCancellation({
      withdrawal,
      user,
      adminId,
      ...refundDetails,
    });
    notifyWithdrawalCancelled(user, withdrawal);
    return formatCancelledWithdrawal(withdrawal, refundDetails.refundsPoints);
  } catch (error) {
    sendFailResponse(error.message || "Failed to cancel withdrawal request");
  } finally {
    await session.endSession();
  }
}

module.exports = {
  createWithdrawal,
  getWithdrawalHistory,
  getWithdrawalDetailsUser,
  listWithdrawals,
  getWithdrawalDetails,
  getWithdrawalsSummary,
  approveWithdrawal,
  approveWithdrawalBatch,
  cancelWithdrawal,
};

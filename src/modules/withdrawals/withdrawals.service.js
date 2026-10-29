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
  PAYOUT_MESSAGE,
} = require("../../constants/payouts");
const Withdrawal = require("../../schemas/withdrawal.schema");
const UserBankAccount = require("../../schemas/user-bank-account.schema");
const User = require("../../schemas/user.schema");
const AppConfig = require("../../schemas/app-config.schema");
const LedgerEntry = require("../../schemas/ledger-entry.schema");
const PayoutAttempt = require("../../schemas/payout-attempt.schema");
const PayoutEvent = require("../../schemas/payout-event.schema");
const PayoutRecon = require("../../schemas/payout-recon.schema");
const { decrypt } = require("../../utils/encryption");
const { sendFcmNotifications } = require("../../functions/fcm");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { formatNotification } = require("../../utils/heplers");
const { enqueueApprovedWithdrawal } = require("./payout-execution.service");
const logger = require("../../config/pino.config");

/**
 * User initiates a withdrawal request.
 */
async function createWithdrawal(userId, data) {
  const { cashAmount } = data;

  const amount = Number(cashAmount);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(Math.round(amount * 100)) ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7
  ) {
    sendFailResponse("Invalid withdrawal amount requested");
  }

  // Load config settings
  const appConfigList = await AppConfig.find().lean();
  const coinConfig = appConfigList[0]?.coinSettings;
  if (!coinConfig) {
    sendFailResponse("Failed to load coin configuration settings");
  }

  const coinAmount = Math.ceil(amount / (coinConfig.coinValue || 1));

  const user = await User.findById(userId);
  if (!user) {
    sendFailResponse("User not found");
  }

  // Validate active bank account configured
  const bankAccount = await UserBankAccount.findOne({ userId, isActive: true });
  if (!bankAccount) {
    sendFailResponse(
      "No active bank account configured. Please configure a bank account first.",
    );
  }

  // Validate sufficient coins balance
  if (user.hydaconCoins < coinAmount) {
    sendFailResponse("Insufficient Hydacoins balance");
  }

  // Validate min and max limits
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

  const session = await mongoose.startSession();
  try {
    let withdrawal;
    await session.withTransaction(async () => {
      // Create withdrawal request in PENDING state
      const [newWithdrawal] = await Withdrawal.create(
        [
          {
            userId,
            coinAmount,
            cashAmount: amount,
            bankAccountId: bankAccount._id,
            status: WITHDRAWAL_STATUS.PENDING,
          },
        ],
        { session },
      );
      withdrawal = newWithdrawal;

      const userBeforeDebit = await User.findOneAndUpdate(
        { _id: userId, hydaconCoins: { $gte: coinAmount } },
        { $inc: { hydaconCoins: -coinAmount } },
        { new: false, session },
      );
      if (!userBeforeDebit) sendFailResponse("Insufficient Hydacoins balance");

      await LedgerEntry.create(
        [
          {
            entryKey: `withdrawal:${withdrawal._id}:coin-debit`,
            userId,
            withdrawalId: withdrawal._id,
            movement: PAYOUT_LEDGER_MOVEMENT.WITHDRAWAL_COIN_DEBIT,
            asset: PAYOUT_ASSET.HYDACON_COIN,
            amount: coinAmount,
            balanceBefore: userBeforeDebit.hydaconCoins,
            balanceAfter: userBeforeDebit.hydaconCoins - coinAmount,
            source: PAYOUT_LEDGER_SOURCE.USER_REQUEST,
          },
        ],
        { session },
      );
    });
    logger.info("Withdrawal requested and coin debit ledgered", {
      withdrawalId: String(withdrawal._id),
      userId: String(userId),
      coinAmount,
      cashAmount: amount,
      currency: PAYOUT_CURRENCY.INR,
    });

    // Send FCM notification
    if (user.fcmTokens?.length && user.enableNotification) {
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

    return {
      message: "Withdrawal request created successfully",
      data: {
        id: withdrawal._id,
        coinAmount: withdrawal.coinAmount,
        cashAmount: withdrawal.cashAmount,
        status: withdrawal.status,
        createdAt: withdrawal.createdAt,
      },
    };
  } catch (error) {
    sendFailResponse(error.message || "Failed to create withdrawal request");
  } finally {
    await session.endSession();
  }
}

/**
 * List withdrawal history for a user.
 */
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
    withdrawals: list.map((w) => ({
      ...w,
      id: w._id,
      bankName: w.bankAccountId?.bankName,
      branchName: w.bankAccountId?.branchName,
      accountHolderName: w.bankAccountId?.accountHolderName,
    })),
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages,
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
  const query = {};

  if (status) {
    query.status = status;
  }

  // Handle search by user name/email or payout ID/UTR
  if (search) {
    const userIds = await User.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    }).select("_id");

    query.$or = [
      { userId: { $in: userIds.map((u) => u._id) } },
      { providerTransferId: { $regex: search, $options: "i" } },
      { utr: { $regex: search, $options: "i" } },
    ];
  }

  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

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
    withdrawals: list.map((w) => ({
      ...w,
      id: w._id,
      user: w.userId,
      bank: w.bankAccountId,
    })),
    total,
    page,
    limit,
    totalPages,
  };
}

/**
 * User: Get detailed info of a single withdrawal.
 */
async function getWithdrawalDetailsUser(id, userId) {
  const withdrawal = await Withdrawal.findOne({ _id: id, userId })
    .populate("userId", "name email phone language payoutContactId")
    .populate("bankAccountId")
    .lean();

  if (!withdrawal) {
    sendFailResponse("Withdrawal request not found");
  }

  const bankAccount = withdrawal.bankAccountId;
  let decryptedBank = null;
  if (bankAccount) {
    const accountNumber = decrypt(
      bankAccount.accountNumber,
      bankAccount.accountIv,
    );
    const ifscCode = decrypt(bankAccount.ifscCode, bankAccount.ifscIv);
    decryptedBank = {
      id: bankAccount._id,
      userName: bankAccount.accountHolderName, // mapped to match transaction details expectation
      accountHolderName: bankAccount.accountHolderName,
      accountNumber,
      ifscCode,
      bankName: bankAccount.bankName,
      branchName: bankAccount.branchName,
    };
  }

  return {
    ...withdrawal,
    id: withdrawal._id,
    user: withdrawal.userId,
    bankDetails: decryptedBank, // mapped to match transaction details expectation
    amount: withdrawal.cashAmount, // mapped to match transaction details expectation
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

  const [financialLedger, payoutAttempts, webhookEvents, reconciliations] =
    await Promise.all([
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
    ]);
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

  // Decrypt bank details for display
  const bankAccount = withdrawal.bankAccountId;
  let decryptedBank = null;
  if (bankAccount) {
    const accountNumber = decrypt(
      bankAccount.accountNumber,
      bankAccount.accountIv,
    );
    const ifscCode = decrypt(bankAccount.ifscCode, bankAccount.ifscIv);
    decryptedBank = {
      id: bankAccount._id,
      accountHolderName: bankAccount.accountHolderName,
      accountNumber,
      ifscCode,
      bankName: bankAccount.bankName,
      branchName: bankAccount.branchName,
      payoutFundAccountId: bankAccount.payoutFundAccountId,
    };
  }

  return {
    ...withdrawal,
    id: withdrawal._id,
    user: withdrawal.userId,
    bankAccount: decryptedBank,
    audit: {
      coverage: requiredLedgerKeys.every((key) => ledgerKeys.has(key))
        ? "COMPLETE"
        : "INCOMPLETE_LEGACY_OR_MISSING_ENTRIES",
      financialLedger,
      payoutAttempts,
      webhookEvents,
      reconciliations,
    },
  };
}

/**
 * Admin: Get counts of withdrawals in different statuses in a single summary API call.
 */
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
    REVERSED: 0,
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
async function approveWithdrawal(adminId, withdrawalId) {
  let data;
  try {
    data = await enqueueApprovedWithdrawal(adminId, withdrawalId);
  } catch (error) {
    sendFailResponse(error.message || PAYOUT_MESSAGE.QUEUE_PAYOUT_FAILED);
  }
  const withdrawal = await Withdrawal.findById(withdrawalId)
    .populate("userId")
    .select("_id status cashAmount userId")
    .lean();
  const user = withdrawal?.userId;
  if (user?.fcmTokens?.length && user.enableNotification) {
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
  return {
    message: PAYOUT_MESSAGE.WITHDRAWAL_APPROVED_QUEUED,
    data: { ...data, status: withdrawal?.status || data.status },
  };
}

/**
 * Admin: Cancels withdrawal request and refunds coins.
 */
async function cancelWithdrawal(adminId, withdrawalId, data) {
  const { remarks } = data;
  if (!remarks || remarks.trim().length < 5) {
    sendFailResponse(
      "A cancellation reason of at least 5 characters is required",
    );
  }

  const withdrawal = await Withdrawal.findById(withdrawalId).populate("userId");
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

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const cancelled = await Withdrawal.updateOne(
        { _id: withdrawal._id, status: WITHDRAWAL_STATUS.PENDING },
        {
          $set: {
            status: WITHDRAWAL_STATUS.CANCELLED,
            remarks: data.remarks || "Cancelled by admin",
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
        { $inc: { hydaconCoins: withdrawal.coinAmount } },
        { new: false, session },
      );
      if (!userBeforeRefund) sendFailResponse("User not found");
      await LedgerEntry.create(
        [
          {
            entryKey: `withdrawal:${withdrawal._id}:coin-refund:cancelled`,
            userId: user._id,
            withdrawalId: withdrawal._id,
            movement: "WITHDRAWAL_COIN_REFUND",
            asset: "HYDACON_COIN",
            amount: withdrawal.coinAmount,
            balanceBefore: userBeforeRefund.hydaconCoins || 0,
            balanceAfter:
              (userBeforeRefund.hydaconCoins || 0) + withdrawal.coinAmount,
            source: "ADMIN_CANCELLATION",
            sourceId: String(adminId),
          },
        ],
        { session },
      );
    });
    logger.info("Withdrawal cancelled and coin refund ledgered", {
      withdrawalId: String(withdrawal._id),
      userId: String(user._id),
      adminId: String(adminId),
      coinAmount: withdrawal.coinAmount,
    });

    // Send FCM notification
    if (user.fcmTokens?.length && user.enableNotification) {
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

    return {
      message: "Withdrawal request cancelled and coins refunded successfully",
      data: {
        id: withdrawal._id,
        status: WITHDRAWAL_STATUS.CANCELLED,
        refundedCoins: withdrawal.coinAmount,
      },
    };
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
  cancelWithdrawal,
};

const mongoose = require("mongoose");
const Withdrawal = require("../../schemas/withdrawal.schema");
const UserBankAccount = require("../../schemas/user-bank-account.schema");
const User = require("../../schemas/user.schema");
const AppConfig = require("../../schemas/app-config.schema");
const { decrypt } = require("../../utils/encryption");
const {
  createRazorpayContact,
  createRazorpayFundAccount,
  createRazorpayPayout,
} = require("../../functions/razorpayx");
const { sendFcmNotifications } = require("../../functions/fcm");
const {
  APP_NOTIFICATIONS,
  getNotification,
} = require("../../constants/notifications");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { attachId, formatNotification } = require("../../utils/heplers");
const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");

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
      // Deduct coins
      const debitResult = await User.updateOne(
        { _id: userId, hydaconCoins: { $gte: coinAmount } },
        { $inc: { hydaconCoins: -coinAmount } },
        { session },
      );
      if (!debitResult.modifiedCount) {
        sendFailResponse("Insufficient Hydacoins balance");
      }

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
        console.error("[FCM] Withdrawal initiated notification failed:", err),
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
      { razorpayPayoutId: { $regex: search, $options: "i" } },
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
    .populate("userId", "name email phone language razorpayContactId")
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
    .populate("userId", "name email phone language razorpayContactId")
    .populate("bankAccountId")
    .lean();

  if (!withdrawal) {
    sendFailResponse("Withdrawal request not found");
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
      razorpayFundAccountId: bankAccount.razorpayFundAccountId,
    };
  }

  return {
    ...withdrawal,
    id: withdrawal._id,
    user: withdrawal.userId,
    bankAccount: decryptedBank,
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
 * Admin: Approves withdrawal, registers Contact/Fund Account, initiates Payout.
 */
async function approveWithdrawal(adminId, withdrawalId) {
  const now = new Date();
  // Claim the request atomically. A stale PROCESSING record without a provider
  // payout id can be retried safely because the payout idempotency key is stable.
  const withdrawal = await Withdrawal.findOneAndUpdate(
    {
      _id: withdrawalId,
      $or: [
        { status: WITHDRAWAL_STATUS.PENDING },
        {
          status: WITHDRAWAL_STATUS.PROCESSING,
          razorpayPayoutId: null,
          approvedAt: { $lt: new Date(now.getTime() - 5 * 60 * 1000) },
        },
      ],
    },
    {
      $set: {
        status: WITHDRAWAL_STATUS.PROCESSING,
        approvedBy: adminId,
        approvedAt: now,
      },
    },
    { new: true },
  )
    .populate("userId")
    .populate("bankAccountId");

  if (!withdrawal) {
    const current = await Withdrawal.findById(withdrawalId).select("status");
    if (!current) sendFailResponse("Withdrawal request not found");
    sendFailResponse(
      `Cannot approve a withdrawal with ${current.status} status`,
    );
  }

  const releaseClaim = () =>
    Withdrawal.updateOne(
      {
        _id: withdrawal._id,
        status: WITHDRAWAL_STATUS.PROCESSING,
        razorpayPayoutId: null,
      },
      {
        $set: {
          status: WITHDRAWAL_STATUS.PENDING,
          approvedBy: null,
          approvedAt: null,
        },
      },
    );

  const user = withdrawal.userId;
  const bankAccount = withdrawal.bankAccountId;

  if (!user || !bankAccount) {
    await releaseClaim();
    sendFailResponse("Associated user or bank details are missing");
  }

  // 1. Create Razorpay Contact if missing
  let contactId = user.razorpayContactId;
  if (!contactId) {
    try {
      const contact = await createRazorpayContact(user);
      if (!contact?.id) throw new Error("Razorpay did not return a contact ID");
      contactId = contact.id;
      user.razorpayContactId = contactId;
      await user.save();
    } catch (err) {
      await releaseClaim();
      sendFailResponse(`Razorpay Contact Creation Failed: ${err.message}`);
    }
  }

  // 2. Create Razorpay Fund Account if missing
  let fundAccountId = bankAccount.razorpayFundAccountId;
  if (!fundAccountId) {
    try {
      const accountNumber = decrypt(
        bankAccount.accountNumber,
        bankAccount.accountIv,
      );
      const ifscCode = decrypt(bankAccount.ifscCode, bankAccount.ifscIv);
      const fundAccount = await createRazorpayFundAccount(contactId, {
        accountHolderName: bankAccount.accountHolderName,
        accountNumber,
        ifscCode,
      });
      if (!fundAccount?.id)
        throw new Error("Razorpay did not return a fund account ID");
      fundAccountId = fundAccount.id;
      bankAccount.razorpayFundAccountId = fundAccountId;
      await bankAccount.save();
    } catch (err) {
      await releaseClaim();
      sendFailResponse(`Razorpay Fund Account Creation Failed: ${err.message}`);
    }
  }

  // 3. Initiate Razorpay Payout (amount in paise, so cashAmount * 100)
  const amountInPaise = Math.round(withdrawal.cashAmount * 100);
  const referenceId = withdrawal._id.toString(); // Idempotency key
  const narration = `Payout of ${withdrawal.cashAmount}`
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .slice(0, 30);

  try {
    const payout = await createRazorpayPayout(
      fundAccountId,
      amountInPaise,
      referenceId,
      narration,
    );
    if (!payout?.id) {
      throw new Error(
        "Razorpay accepted the request without returning a payout ID",
      );
    }

    await Withdrawal.updateOne(
      {
        _id: withdrawal._id,
        status: {
          $nin: [
            WITHDRAWAL_STATUS.COMPLETED,
            WITHDRAWAL_STATUS.FAILED,
            WITHDRAWAL_STATUS.REVERSED,
            WITHDRAWAL_STATUS.CANCELLED,
          ],
        },
      },
      { $set: { razorpayPayoutId: payout.id } },
    );
    const latestWithdrawal = await Withdrawal.findById(withdrawal._id).select(
      "status",
    );

    // Send FCM notification
    if (user.fcmTokens?.length && user.enableNotification) {
      const localizedNotif = getNotification(
        APP_NOTIFICATIONS.withdraw.approved,
        user.language,
      );
      sendFcmNotifications(
        user.fcmTokens,
        localizedNotif.title,
        localizedNotif.body,
      ).catch((err) =>
        console.error("[FCM] Withdrawal approval notification failed:", err),
      );
    }

    return {
      message: "Withdrawal approved. Payout is being processed.",
      data: {
        id: withdrawal._id,
        status: latestWithdrawal?.status || WITHDRAWAL_STATUS.PROCESSING,
        razorpayPayoutId: payout.id,
      },
    };
  } catch (err) {
    // A received 4xx from Razorpay is a definitive rejection. Network errors
    // and 5xx responses are ambiguous, so keep PROCESSING for safe idempotent retry.
    if (
      err?.definitive ||
      (err?.providerStatusCode >= 400 && err.providerStatusCode < 500)
    ) {
      await releaseClaim();
    }
    sendFailResponse(`Razorpay Payout Initiation Failed: ${err.message}`);
  }
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
      const refund = await User.updateOne(
        { _id: user._id },
        { $inc: { hydaconCoins: withdrawal.coinAmount } },
        { session },
      );
      if (!refund.matchedCount) sendFailResponse("User not found");
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
        console.error("[FCM] Withdrawal cancelled notification failed:", err),
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

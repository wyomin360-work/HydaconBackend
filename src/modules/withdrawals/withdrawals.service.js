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
const { APP_NOTIFICATIONS, getNotification } = require("../../constants/notifications");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { attachId, formatNotification } = require("../../utils/heplers");

/**
 * User initiates a withdrawal request.
 */
async function createWithdrawal(userId, data) {
  const { coinAmount } = data;

  if (!coinAmount || coinAmount <= 0) {
    sendFailResponse("Invalid coin amount requested");
  }

  const user = await User.findById(userId);
  if (!user) {
    sendFailResponse("User not found");
  }

  // Validate active bank account configured
  const bankAccount = await UserBankAccount.findOne({ userId, isActive: true });
  if (!bankAccount) {
    sendFailResponse("No active bank account configured. Please configure a bank account first.");
  }

  // Validate sufficient coins balance
  if (user.hydaconCoins < coinAmount) {
    sendFailResponse("Insufficient Hydacoins balance");
  }

  // Load config settings
  const appConfigList = await AppConfig.find().lean();
  const coinConfig = appConfigList[0]?.coinSettings;
  if (!coinConfig) {
    sendFailResponse("Failed to load coin configuration settings");
  }

  const cashAmount = coinAmount * coinConfig.coinValue;

  // Validate min and max limits
  if (cashAmount < coinConfig.minWithdrawAmount) {
    sendFailResponse(`Amount is below the minimum withdrawal limit of ₹${coinConfig.minWithdrawAmount}`);
  }
  if (cashAmount > coinConfig.maxWithdrawAmount) {
    sendFailResponse(`Amount exceeds the maximum withdrawal limit of ₹${coinConfig.maxWithdrawAmount}`);
  }

  const session = await mongoose.startSession();
  try {
    let withdrawal;
    await session.withTransaction(async () => {
      // Deduct coins
      user.hydaconCoins = user.hydaconCoins - coinAmount;
      await user.save({ session });

      // Create withdrawal request in PENDING state
      const [newWithdrawal] = await Withdrawal.create(
        [
          {
            userId,
            coinAmount,
            cashAmount,
            bankAccountId: bankAccount._id,
            status: "PENDING",
          },
        ],
        { session }
      );
      withdrawal = newWithdrawal;
    });

    // Send FCM notification
    if (user.fcmTokens?.length && user.enableNotification) {
      const localizedNotif = getNotification(APP_NOTIFICATIONS.withdraw.initiated, user.language);
      sendFcmNotifications(
        user.fcmTokens,
        localizedNotif.title,
        formatNotification(localizedNotif.body, { amount: cashAmount })
      ).catch((err) => console.error("[FCM] Withdrawal initiated notification failed:", err));
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
async function getWithdrawalHistory(userId) {
  const list = await Withdrawal.find({ userId })
    .populate("bankAccountId", "bankName branchName accountHolderName")
    .sort({ createdAt: -1 })
    .lean();

  return list.map((w) => ({
    ...w,
    id: w._id,
    bankName: w.bankAccountId?.bankName,
    branchName: w.bankAccountId?.branchName,
    accountHolderName: w.bankAccountId?.accountHolderName,
  }));
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
    const accountNumber = decrypt(bankAccount.accountNumber, bankAccount.accountIv);
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
    PENDING: 0,
    PROCESSING: 0,
    COMPLETED: 0,
    FAILED: 0,
    CANCELLED: 0,
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
  const withdrawal = await Withdrawal.findById(withdrawalId)
    .populate("userId")
    .populate("bankAccountId");

  if (!withdrawal) {
    sendFailResponse("Withdrawal request not found");
  }

  if (withdrawal.status !== "PENDING") {
    sendFailResponse(`Cannot approve a withdrawal with ${withdrawal.status} status`);
  }

  const user = withdrawal.userId;
  const bankAccount = withdrawal.bankAccountId;

  if (!user || !bankAccount) {
    sendFailResponse("Associated user or bank details are missing");
  }

  // 1. Create Razorpay Contact if missing
  let contactId = user.razorpayContactId;
  if (!contactId) {
    try {
      const contact = await createRazorpayContact(user);
      contactId = contact.id;
      user.razorpayContactId = contactId;
      await user.save();
    } catch (err) {
      sendFailResponse(`Razorpay Contact Creation Failed: ${err.message}`);
    }
  }

  // 2. Create Razorpay Fund Account if missing
  let fundAccountId = bankAccount.razorpayFundAccountId;
  if (!fundAccountId) {
    const accountNumber = decrypt(bankAccount.accountNumber, bankAccount.accountIv);
    const ifscCode = decrypt(bankAccount.ifscCode, bankAccount.ifscIv);

    try {
      const fundAccount = await createRazorpayFundAccount(contactId, {
        accountHolderName: bankAccount.accountHolderName,
        accountNumber,
        ifscCode,
      });
      fundAccountId = fundAccount.id;
      bankAccount.razorpayFundAccountId = fundAccountId;
      await bankAccount.save();
    } catch (err) {
      sendFailResponse(`Razorpay Fund Account Creation Failed: ${err.message}`);
    }
  }

  // 3. Initiate Razorpay Payout (amount in paise, so cashAmount * 100)
  const amountInPaise = Math.round(withdrawal.cashAmount * 100);
  const referenceId = withdrawal._id.toString(); // Idempotency key
  const narration = `Payout of ${withdrawal.cashAmount}`.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 30);

  try {
    const payout = await createRazorpayPayout(fundAccountId, amountInPaise, referenceId, narration);

    // Update Withdrawal status to PROCESSING
    withdrawal.status = "PROCESSING";
    withdrawal.razorpayPayoutId = payout.id;
    withdrawal.approvedBy = adminId;
    withdrawal.approvedAt = new Date();
    await withdrawal.save();

    // Send FCM notification
    if (user.fcmTokens?.length && user.enableNotification) {
      const localizedNotif = getNotification(APP_NOTIFICATIONS.withdraw.approved, user.language);
      sendFcmNotifications(
        user.fcmTokens,
        localizedNotif.title,
        localizedNotif.body
      ).catch((err) => console.error("[FCM] Withdrawal approval notification failed:", err));
    }

    return {
      message: "Withdrawal approved. Payout is being processed.",
      data: {
        id: withdrawal._id,
        status: withdrawal.status,
        razorpayPayoutId: payout.id,
      },
    };
  } catch (err) {
    sendFailResponse(`Razorpay Payout Initiation Failed: ${err.message}`);
  }
}

/**
 * Admin: Cancels withdrawal request and refunds coins.
 */
async function cancelWithdrawal(adminId, withdrawalId, data) {
  const { remarks } = data;
  if (!remarks || remarks.trim().length < 5) {
    sendFailResponse("A cancellation reason of at least 5 characters is required");
  }

  const withdrawal = await Withdrawal.findById(withdrawalId).populate("userId");
  if (!withdrawal) {
    sendFailResponse("Withdrawal request not found");
  }

  if (withdrawal.status !== "PENDING") {
    sendFailResponse(`Cannot cancel a withdrawal in ${withdrawal.status} status`);
  }

  const user = withdrawal.userId;
  if (!user) {
    sendFailResponse("User not found");
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Refund coins
      user.hydaconCoins = user.hydaconCoins + withdrawal.coinAmount;
      await user.save({ session });

      // Cancel withdrawal request
      withdrawal.status = "CANCELLED";
      withdrawal.remarks = remarks;
      withdrawal.approvedBy = adminId; // tracks who cancelled it
      withdrawal.approvedAt = new Date();
      await withdrawal.save({ session });
    });

    // Send FCM notification
    if (user.fcmTokens?.length && user.enableNotification) {
      const localizedNotif = getNotification(APP_NOTIFICATIONS.withdraw.cancelled, user.language);
      sendFcmNotifications(
        user.fcmTokens,
        localizedNotif.title,
        localizedNotif.body
      ).catch((err) => console.error("[FCM] Withdrawal cancelled notification failed:", err));
    }

    return {
      message: "Withdrawal request cancelled and coins refunded successfully",
      data: {
        id: withdrawal._id,
        status: withdrawal.status,
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
  listWithdrawals,
  getWithdrawalDetails,
  getWithdrawalsSummary,
  approveWithdrawal,
  cancelWithdrawal,
};

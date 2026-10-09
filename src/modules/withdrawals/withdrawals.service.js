const mongoose = require("mongoose");
const Withdrawal = require("../../schemas/withdrawal.schema");
const UserBankAccount = require("../../schemas/user-bank-account.schema");
const User = require("../../schemas/user.schema");
const AppConfig = require("../../schemas/app-config.schema");
const LedgerEntry = require("../../schemas/ledger-entry.schema");
const PayoutAttempt = require("../../schemas/payout-attempt.schema");
const PayoutEvent = require("../../schemas/payout-event.schema");
const PayoutRecon = require("../../schemas/payout-recon.schema");
const { decrypt } = require("../../utils/encryption");
const {
  createPayoutContact,
  createPayoutFundAccount,
  createPayout: createProviderPayout,
  createIdempotencyKey: payoutIdempotencyKey,
} = require("../../functions/razorpayx");
const { sendFcmNotifications } = require("../../functions/fcm");
const {
  APP_NOTIFICATIONS,
  getNotification,
} = require("../../constants/notifications");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { attachId, formatNotification } = require("../../utils/heplers");
const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");
const logger = require("../../config/pino.config");

function safePayoutResponse(payout = {}) {
  const allowedFields = [
    "id",
    "status",
    "amount",
    "currency",
    "mode",
    "purpose",
    "reference_id",
    "fees",
    "tax",
    "utr",
    "failure_reason",
  ];
  return Object.fromEntries(
    allowedFields
      .filter((field) => payout[field] !== undefined && payout[field] !== null)
      .map((field) => [
        field,
        typeof payout[field] === "string"
          ? (field === "failure_reason"
              ? payout[field].replace(/\d{6,}/g, "[redacted]")
              : payout[field]
            ).slice(0, 500)
          : payout[field],
      ]),
  );
}

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
            movement: "WITHDRAWAL_COIN_DEBIT",
            asset: "HYDACON_COIN",
            amount: coinAmount,
            balanceBefore: userBeforeDebit.hydaconCoins,
            balanceAfter: userBeforeDebit.hydaconCoins - coinAmount,
            source: "USER_REQUEST",
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
      currency: "INR",
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
      { providerPayoutId: { $regex: search, $options: "i" } },
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
          ...(withdrawal.providerPayoutId
            ? [{ payoutId: withdrawal.providerPayoutId }]
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
  if (["FAILED", "REVERSED", "CANCELLED"].includes(withdrawal.status)) {
    requiredLedgerKeys.push(
      `withdrawal:${withdrawal._id}:coin-refund:${withdrawal.status.toLowerCase()}`,
    );
  }
  if (withdrawal.status === "COMPLETED") {
    requiredLedgerKeys.push(`withdrawal:${withdrawal._id}:payout-completed`);
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
          providerPayoutId: null,
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
        providerPayoutId: null,
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

  // 1. Create payout provider Contact if missing
  let contactId = user.payoutContactId;
  if (!contactId) {
    try {
      const contact = await createPayoutContact(user);
      if (!contact?.id)
        throw new Error("payout provider did not return a contact ID");
      contactId = contact.id;
      user.payoutContactId = contactId;
      await user.save();
    } catch (err) {
      logger.error("payout provider contact setup failed for withdrawal", {
        withdrawalId: String(withdrawal._id),
        error: err.message,
      });
      await releaseClaim();
      sendFailResponse(
        `payout provider Contact Creation Failed: ${err.message}`,
      );
    }
  }

  // 2. Create payout provider Fund Account if missing
  let fundAccountId = bankAccount.payoutFundAccountId;
  if (!fundAccountId) {
    try {
      const accountNumber = decrypt(
        bankAccount.accountNumber,
        bankAccount.accountIv,
      );
      const ifscCode = decrypt(bankAccount.ifscCode, bankAccount.ifscIv);
      const fundAccount = await createPayoutFundAccount(contactId, {
        accountHolderName: bankAccount.accountHolderName,
        accountNumber,
        ifscCode,
      });
      if (!fundAccount?.id)
        throw new Error("payout provider did not return a fund account ID");
      fundAccountId = fundAccount.id;
      bankAccount.payoutFundAccountId = fundAccountId;
      await bankAccount.save();
    } catch (err) {
      logger.error("payout provider fund account setup failed for withdrawal", {
        withdrawalId: String(withdrawal._id),
        error: err.message,
      });
      await releaseClaim();
      sendFailResponse(
        `payout provider Fund Account Creation Failed: ${err.message}`,
      );
    }
  }

  // 3. Initiate payout provider Payout (amount in paise, so cashAmount * 100)
  const amountInPaise = Math.round(withdrawal.cashAmount * 100);
  const referenceId = withdrawal._id.toString(); // Idempotency key
  const narration = `Payout of ${withdrawal.cashAmount}`
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .slice(0, 30);

  const requestStartedAt = new Date();
  const attemptSession = await mongoose.startSession();
  let payoutAttempt;
  try {
    await attemptSession.withTransaction(async () => {
      const updatedWithdrawal = await Withdrawal.findOneAndUpdate(
        {
          _id: withdrawal._id,
          status: WITHDRAWAL_STATUS.PROCESSING,
          providerPayoutId: null,
        },
        { $inc: { payoutAttemptCount: 1 } },
        { new: true, session: attemptSession },
      );
      if (!updatedWithdrawal) {
        throw new Error("Withdrawal is no longer eligible for payout");
      }
      payoutAttempt = new PayoutAttempt({
        withdrawalId: withdrawal._id,
        attemptNumber: updatedWithdrawal.payoutAttemptCount,
        adminId,
        idempotencyKey: payoutIdempotencyKey(referenceId),
        referenceId,
        fundAccountId,
        amount: amountInPaise,
        currency: "INR",
        mode: "IMPS",
        purpose: "payout",
        narration,
        queueIfLowBalance: true,
        requestStartedAt,
        outcome: "REQUESTED",
      });
      await payoutAttempt.save({ session: attemptSession });
    });
    logger.info("payout provider attempt recorded", {
      withdrawalId: String(withdrawal._id),
      payoutAttemptId: String(payoutAttempt._id),
      attemptNumber: payoutAttempt.attemptNumber,
      idempotencyKey: payoutAttempt.idempotencyKey,
      amount: amountInPaise,
      currency: "INR",
      mode: "IMPS",
    });
  } catch (error) {
    await releaseClaim();
    throw error;
  } finally {
    await attemptSession.endSession();
  }

  let payout;
  try {
    payout = await createProviderPayout(
      fundAccountId,
      amountInPaise,
      referenceId,
      narration,
    );
  } catch (err) {
    const failedAt = new Date();
    const definitive = Boolean(
      err?.definitive ||
      (err?.providerStatusCode >= 400 && err.providerStatusCode < 500),
    );
    await PayoutAttempt.updateOne(
      { _id: payoutAttempt._id },
      {
        $set: {
          outcome: definitive ? "DEFINITIVE_FAILURE" : "AMBIGUOUS_FAILURE",
          httpStatus: err?.providerStatusCode || null,
          providerErrorCode: err?.providerErrorCode || null,
          providerErrorDescription: err.message,
          responseReceivedAt: failedAt,
          durationMs: failedAt.getTime() - requestStartedAt.getTime(),
        },
      },
    );
    logger.error("payout provider request failed", {
      withdrawalId: String(withdrawal._id),
      payoutAttemptId: String(payoutAttempt._id),
      providerStatusCode: err?.providerStatusCode || null,
      providerErrorCode: err?.providerErrorCode || null,
      outcome: definitive ? "DEFINITIVE_FAILURE" : "AMBIGUOUS_FAILURE",
    });

    if (definitive) await releaseClaim();
    sendFailResponse(
      `payout provider Payout Initiation Failed: ${err.message}`,
    );
  }

  const responseReceivedAt = new Date();
  const safeResponse = safePayoutResponse(payout);
  if (!payout?.id) {
    await PayoutAttempt.updateOne(
      { _id: payoutAttempt._id },
      {
        $set: {
          outcome: "AMBIGUOUS_FAILURE",
          providerResponse: safeResponse,
          responseReceivedAt,
          durationMs: responseReceivedAt.getTime() - requestStartedAt.getTime(),
          providerErrorDescription:
            "payout provider response did not contain a payout ID",
        },
      },
    );
    logger.error("payout provider returned a payout response without an ID", {
      withdrawalId: String(withdrawal._id),
      payoutAttemptId: String(payoutAttempt._id),
      providerResponse: safeResponse,
    });
    sendFailResponse("payout provider response did not contain a payout ID");
  }

  const responseSession = await mongoose.startSession();
  try {
    await responseSession.withTransaction(async () => {
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
        { $set: { providerPayoutId: payout.id } },
        { session: responseSession },
      );
      const attemptUpdate = await PayoutAttempt.updateOne(
        { _id: payoutAttempt._id },
        {
          $set: {
            outcome: "SUCCEEDED",
            httpStatus: payout._httpStatus || null,
            payoutId: payout.id,
            providerStatus: payout.status || null,
            providerResponse: safeResponse,
            responseReceivedAt,
            durationMs:
              responseReceivedAt.getTime() - requestStartedAt.getTime(),
          },
        },
        { session: responseSession },
      );
      if (!attemptUpdate.matchedCount)
        throw new Error("Payout attempt audit record was not found");
    });
  } finally {
    await responseSession.endSession();
  }
  const latestWithdrawal = await Withdrawal.findById(withdrawal._id).select(
    "status",
  );
  logger.info("payout provider request accepted", {
    withdrawalId: String(withdrawal._id),
    payoutAttemptId: String(payoutAttempt._id),
    payoutId: payout.id,
    providerStatus: payout.status || null,
    amount: amountInPaise,
    currency: "INR",
  });

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
      logger.error("FCM withdrawal approval notification failed", {
        withdrawalId: String(withdrawal._id),
        error: err.message,
      }),
    );
  }

  return {
    message: "Withdrawal approved. Payout is being processed.",
    data: {
      id: withdrawal._id,
      status: latestWithdrawal?.status || WITHDRAWAL_STATUS.PROCESSING,
      providerPayoutId: payout.id,
    },
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

const mongoose = require("mongoose");
const service = require("../../../modules/withdrawals/withdrawals.service");
const userService = require("../../../modules/user/user.service");
const webhookService = require("../../../modules/webhooks/webhooks.service");
const User = require("../../../schemas/user.schema");
const UserBankAccount = require("../../../schemas/user-bank-account.schema");
const Withdrawal = require("../../../schemas/withdrawal.schema");
const AppConfig = require("../../../schemas/app-config.schema");
const LedgerEntry = require("../../../schemas/ledger-entry.schema");
const PayoutAttempt = require("../../../schemas/payout-attempt.schema");
const Role = require("../../../schemas/role.schema");
const { decrypt } = require("../../../utils/encryption");
const crypto = require("crypto");

async function processSignedWebhook(payload) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const secret = process.env.RAZORPAYX_WEBHOOK_SECRET;
  const headers = secret
    ? {
        "x-razorpay-signature": crypto
          .createHmac("sha256", secret)
          .update(rawBody)
          .digest("hex"),
      }
    : {};
  return webhookService.processWebhook(headers, rawBody, payload);
}

// Mock the external Razorpay functions
jest.mock("../../../functions/razorPay", () => ({
  validateIFSC: jest
    .fn()
    .mockResolvedValue({ BANK: "HDFC Bank", BRANCH: "MUMBAI" }),
}));

jest.mock("../../../functions/razorpayx", () => ({
  createPayoutContact: jest.fn().mockResolvedValue({ id: "cont_test123" }),
  createPayoutFundAccount: jest.fn().mockResolvedValue({ id: "fa_test123" }),
  createPayout: jest.fn().mockResolvedValue({ id: "pout_test123" }),
  createIdempotencyKey: jest.fn().mockReturnValue("idempotency-test-key"),
}));

jest.mock("../../../functions/fcm", () => ({
  sendFcmNotifications: jest.fn().mockResolvedValue({ success: true }),
}));

describe("Withdrawals Service & Webhooks Test Suite", () => {
  let userId;
  let adminId;

  jest.setTimeout(30000);

  beforeAll(async () => {
    userId = new mongoose.Types.ObjectId();
    adminId = new mongoose.Types.ObjectId();

    const dbUrl =
      process.env.MONGODB_URL || "mongodb://localhost:27017/hydacon_test";
    let testDbUrl = dbUrl;
    if (dbUrl.includes("?")) {
      const parts = dbUrl.split("?");
      if (parts[0].endsWith("/")) {
        testDbUrl = parts[0] + "hydacon_test?" + parts[1];
      } else {
        testDbUrl = parts[0] + "/hydacon_test?" + parts[1];
      }
    } else {
      testDbUrl = dbUrl + "/hydacon_test";
    }
    await mongoose.connect(testDbUrl);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await UserBankAccount.deleteMany({});
    await Withdrawal.deleteMany({});
    await LedgerEntry.deleteMany({});
    await PayoutAttempt.deleteMany({});
    await AppConfig.deleteMany({});

    // Setup default app config
    await AppConfig.create({
      name: "Hydacon Test Config",
      currentVersion: "1.0.0",
      latestVersion: "1.0.0",
      coinSettings: {
        coinValue: 2, // 1 coin = 2 rupees
        minWithdrawAmount: 100,
        maxWithdrawAmount: 1000,
        referralBonus: 50,
        pointToCoinRatio: 100,
      },
    });

    // Create user with coins
    await User.create({
      _id: userId,
      name: "John Doe",
      email: "john@example.com",
      password: "password123",
      hydaconCoins: 500, // worth 1000 rupees
    });
  });

  test("1. Configure User Bank Account (Encrypted)", async () => {
    const data = {
      userName: "John Doe",
      accountNumber: "1234567890",
      ifscCode: "HDFC0000053",
    };

    const res = await userService.addUserBankDetails(data, userId);
    expect(res.message).toContain("successfully");

    const savedAccount = await UserBankAccount.findOne({
      userId,
      isActive: true,
    });
    expect(savedAccount).toBeDefined();
    expect(savedAccount.accountHolderName).toBe("John Doe");

    // Test decryption
    const decryptedAccount = decrypt(
      savedAccount.accountNumber,
      savedAccount.accountIv,
    );
    expect(decryptedAccount).toBe("1234567890");
  });

  test("2. Create Withdrawal - PENDING status & Coin Deduction", async () => {
    // Configure bank account first
    await userService.addUserBankDetails(
      {
        userName: "John Doe",
        accountNumber: "1234567890",
        ifscCode: "HDFC0000053",
      },
      userId,
    );

    // Request withdrawal of 100 coins (worth 200 rupees)
    const withdrawalRes = await service.createWithdrawal(userId, {
      cashAmount: 200,
    });
    expect(withdrawalRes.data.status).toBe("PENDING");
    expect(withdrawalRes.data.cashAmount).toBe(200);

    // Verify user coins deducted
    const user = await User.findById(userId);
    expect(user.hydaconCoins).toBe(400); // 500 - 100
    const debit = await LedgerEntry.findOne({
      withdrawalId: withdrawalRes.data.id,
      movement: "WITHDRAWAL_COIN_DEBIT",
    });
    expect(debit).toMatchObject({
      amount: 100,
      balanceBefore: 500,
      balanceAfter: 400,
    });
  });

  test("3. Approve Withdrawal - Create Contact, Fund Account, & Payout", async () => {
    await userService.addUserBankDetails(
      {
        userName: "John Doe",
        accountNumber: "1234567890",
        ifscCode: "HDFC0000053",
      },
      userId,
    );

    const withdrawalRes = await service.createWithdrawal(userId, {
      cashAmount: 200,
    });
    const withdrawalId = withdrawalRes.data.id;

    // Approve the withdrawal
    const approveRes = await service.approveWithdrawal(adminId, withdrawalId);
    expect(approveRes.data.status).toBe("PROCESSING");
    expect(approveRes.data.providerPayoutId).toBe("pout_test123");

    // Verify User has Contact ID
    const user = await User.findById(userId);
    expect(user.payoutContactId).toBe("cont_test123");

    // Verify Bank Account has Fund Account ID
    const bankAccount = await UserBankAccount.findOne({
      userId,
      isActive: true,
    });
    expect(bankAccount.payoutFundAccountId).toBe("fa_test123");

    // Verify Withdrawal is in PROCESSING state
    const withdrawal = await Withdrawal.findById(withdrawalId);
    expect(withdrawal.status).toBe("PROCESSING");
    const attempt = await PayoutAttempt.findOne({ withdrawalId });
    expect(attempt).toMatchObject({
      attemptNumber: 1,
      idempotencyKey: "idempotency-test-key",
      payoutId: "pout_test123",
      outcome: "SUCCEEDED",
    });
  });

  test("4. Cancel Withdrawal - Refund Coins & CANCELLED status", async () => {
    await userService.addUserBankDetails(
      {
        userName: "John Doe",
        accountNumber: "1234567890",
        ifscCode: "HDFC0000053",
      },
      userId,
    );

    const withdrawalRes = await service.createWithdrawal(userId, {
      cashAmount: 200,
    });
    const withdrawalId = withdrawalRes.data.id;

    // Cancel withdrawal
    const cancelRes = await service.cancelWithdrawal(adminId, withdrawalId, {
      remarks: "User requested cancel",
    });
    expect(cancelRes.data.status).toBe("CANCELLED");
    expect(cancelRes.data.refundedCoins).toBe(100);

    // Verify User coins credited back
    const user = await User.findById(userId);
    expect(user.hydaconCoins).toBe(500); // restored back to 500
    const refund = await LedgerEntry.findOne({
      withdrawalId,
      movement: "WITHDRAWAL_COIN_REFUND",
    });
    expect(refund).toMatchObject({
      amount: 100,
      balanceBefore: 400,
      balanceAfter: 500,
    });
  });

  test("5. Webhook - payout.processed updates status to COMPLETED & totals", async () => {
    await userService.addUserBankDetails(
      {
        userName: "John Doe",
        accountNumber: "1234567890",
        ifscCode: "HDFC0000053",
      },
      userId,
    );

    const withdrawalRes = await service.createWithdrawal(userId, {
      cashAmount: 200,
    });
    const withdrawalId = withdrawalRes.data.id;

    // Set payout ID
    await Withdrawal.findByIdAndUpdate(withdrawalId, {
      status: "PROCESSING",
      providerPayoutId: "pout_processed_123",
    });

    // Mock Webhook request
    const payload = {
      event: "payout.processed",
      payload: {
        payout: {
          entity: {
            id: "pout_processed_123",
            reference_id: withdrawalId.toString(),
            utr: "UTR123456",
            status: "processed",
          },
        },
      },
    };

    const webhookRes = await processSignedWebhook(payload);
    expect(webhookRes.status).toBe("success");

    // Verify Withdrawal is COMPLETED
    const withdrawal = await Withdrawal.findById(withdrawalId);
    expect(withdrawal.status).toBe("COMPLETED");
    expect(withdrawal.utr).toBe("UTR123456");

    // Verify User totalWithdraw updated
    const user = await User.findById(userId);
    expect(user.totalWithdraw).toBe(200); // ₹200 added
    const payoutLedger = await LedgerEntry.findOne({
      withdrawalId,
      movement: "PAYOUT_COMPLETED",
    });
    expect(payoutLedger).toMatchObject({
      amount: 200,
      asset: "INR",
      payoutId: "pout_processed_123",
    });
  });

  test("6. Webhook - payout.failed/reversed refunds coins", async () => {
    await userService.addUserBankDetails(
      {
        userName: "John Doe",
        accountNumber: "1234567890",
        ifscCode: "HDFC0000053",
      },
      userId,
    );

    const withdrawalRes = await service.createWithdrawal(userId, {
      cashAmount: 200,
    });
    const withdrawalId = withdrawalRes.data.id;

    // Set payout ID
    await Withdrawal.findByIdAndUpdate(withdrawalId, {
      status: "PROCESSING",
      providerPayoutId: "pout_failed_123",
    });

    // Mock Failed Webhook request
    const failedPayload = {
      event: "payout.failed",
      payload: {
        payout: {
          entity: {
            id: "pout_failed_123",
            reference_id: withdrawalId.toString(),
            status: "failed",
            failure_reason: "Insufficient balance in master account",
          },
        },
      },
    };

    const webhookRes = await processSignedWebhook(failedPayload);
    expect(webhookRes.status).toBe("success");

    // Verify Withdrawal is FAILED
    const withdrawal = await Withdrawal.findById(withdrawalId);
    expect(withdrawal.status).toBe("FAILED");
    expect(withdrawal.failureReason).toBe(
      "Insufficient balance in master account",
    );

    // Verify coins refunded to user
    const user = await User.findById(userId);
    expect(user.hydaconCoins).toBe(500); // 400 + 100
    const refund = await LedgerEntry.findOne({
      withdrawalId,
      movement: "WITHDRAWAL_COIN_REFUND",
    });
    expect(refund).toMatchObject({
      amount: 100,
      balanceBefore: 400,
      balanceAfter: 500,
    });
  });
});

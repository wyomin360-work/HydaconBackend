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
const PayoutOutbox = require("../../../schemas/payout-outbox.schema");
const Payout = require("../../../schemas/payout.schema");
const PayoutEvent = require("../../../schemas/payout-event.schema");
const PayoutRecon = require("../../../schemas/payout-recon.schema");
const PayoutBatch = require("../../../schemas/payout-batch.schema");
const PointsLedger = require("../../../schemas/points-ledger.schema");
require("../../../schemas/role.schema");
const { decrypt } = require("../../../utils/encryption");
const crypto = require("crypto");
const { KYC_STATUS } = require("../../../constants/user");
const {
  PAYOUT_LEDGER_MOVEMENT,
  PAYOUT_PROVIDER,
} = require("../../../constants/payouts");
const { WITHDRAWAL_STATUS } = require("../../../constants/withdrawals");

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

// Pin the provider to RazorpayX for this suite so that mocks, withdrawal
// records and webhook payloads are all consistent, regardless of which
// PAYOUT_PROVIDER is set in the environment.
jest.mock("../../../functions/payouts", () => {
  const razorpayx = jest.requireActual(
    "../../../functions/payouts/providers/razorpayx",
  );
  return {
    getProvider: jest.fn().mockReturnValue(razorpayx),
    currentProviderName: jest.fn().mockReturnValue("razorpayx"),
    normalizeProviderName: jest.fn().mockReturnValue("razorpayx"),
  };
});

// Mock the API used by the provider adapter, without reaching Razorpay.
jest.mock("../../../functions/razorPay", () => ({
  validateIFSC: jest
    .fn()
    .mockResolvedValue({ BANK: "HDFC Bank", BRANCH: "MUMBAI" }),
}));

jest.mock("../../../functions/payouts/providers/razorpayx/api", () => ({
  createContact: jest.fn().mockResolvedValue({ id: "cont_test123" }),
  createFundAccount: jest.fn().mockResolvedValue({ id: "fa_test123" }),
  createTransfer: jest.fn().mockResolvedValue({ id: "pout_test123" }),
  fetchTransferByReference: jest.fn(),
  createIdempotencyKey: jest.fn().mockReturnValue("idempotency-test-key"),
  validateConfig: jest.fn(),
}));

jest.mock("../../../functions/fcm", () => ({
  sendFcmNotifications: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("../../../functions/nodemailer", () => ({
  sendMail: jest.fn().mockResolvedValue(true),
  sendTemplateEmail: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../../modules/payouts/payout-execution.service", () => {
  const actual = jest.requireActual(
    "../../../modules/payouts/payout-execution.service",
  );
  return { ...actual, wakePayoutOutboxWorker: jest.fn() };
});

describe("Withdrawals Service & Webhooks Test Suite", () => {
  let userId;
  let adminId;
  let originalPayoutProvider;
  let originalWebhookSecret;

  jest.setTimeout(30000);

  beforeAll(async () => {
    originalPayoutProvider = process.env.PAYOUT_PROVIDER;
    originalWebhookSecret = process.env.RAZORPAYX_WEBHOOK_SECRET;
    process.env.PAYOUT_PROVIDER = PAYOUT_PROVIDER.RAZORPAYX;
    process.env.RAZORPAYX_WEBHOOK_SECRET = "withdrawal-test-webhook-secret";

    userId = new mongoose.Types.ObjectId();
    adminId = new mongoose.Types.ObjectId();

    // Prefer an explicit test URL, then the app's Atlas URL, then local fallback.
    const testDbUrl =
      process.env.TEST_MONGODB_URL ||
      process.env.MONGODB_URL ||
      "mongodb://127.0.0.1:27017/hydacon_test";
    await mongoose.connect(testDbUrl, {
      dbName: "hydacon_test",
      serverSelectionTimeoutMS: 10000,
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
    if (originalPayoutProvider === undefined) {
      delete process.env.PAYOUT_PROVIDER;
    } else {
      process.env.PAYOUT_PROVIDER = originalPayoutProvider;
    }
    if (originalWebhookSecret === undefined) {
      delete process.env.RAZORPAYX_WEBHOOK_SECRET;
    } else {
      process.env.RAZORPAYX_WEBHOOK_SECRET = originalWebhookSecret;
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await UserBankAccount.deleteMany({});
    await Withdrawal.deleteMany({});
    await LedgerEntry.deleteMany({});
    await PayoutAttempt.deleteMany({});
    await PayoutOutbox.deleteMany({});
    await Payout.deleteMany({});
    await PayoutEvent.deleteMany({});
    await PayoutRecon.deleteMany({});
    await PayoutBatch.deleteMany({});
    await PointsLedger.deleteMany({});
    await AppConfig.deleteMany({});

    // Setup default app config
    await AppConfig.create({
      name: "Hydacon Test Config",
      currentVersion: "1.0.0",
      latestVersion: "1.0.0",
      coinSettings: {
        coinValue: 2, // 1 reward point = ₹2
        minWithdrawAmount: 100,
        maxWithdrawAmount: 1000,
        referralBonus: 50,
        pointToCoinRatio: 100,
      },
    });

    // Create an eligible user with a reward points balance.
    await User.create({
      _id: userId,
      name: "John Doe",
      email: "john@example.com",
      password: "password123",
      totalPoints: 500,
      kycStatus: KYC_STATUS.APPROVED,
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

  test("2. Create Withdrawal - PENDING status & points deduction", async () => {
    // Configure bank account first
    await userService.addUserBankDetails(
      {
        userName: "John Doe",
        accountNumber: "1234567890",
        ifscCode: "HDFC0000053",
      },
      userId,
    );

    // Request withdrawal of 100 points (worth ₹200).
    const withdrawalRes = await service.createWithdrawal(userId, {
      cashAmount: 200,
    });
    expect(withdrawalRes.data.status).toBe("PENDING");
    expect(withdrawalRes.data.cashAmount).toBe(200);

    // Verify reward points were debited and recorded in the ledger.
    const user = await User.findById(userId);
    expect(user.totalPoints).toBe(400);
    const debit = await LedgerEntry.findOne({
      withdrawalId: withdrawalRes.data.id,
      movement: PAYOUT_LEDGER_MOVEMENT.WITHDRAWAL_POINTS_DEBIT,
    });
    expect(debit).toMatchObject({
      amount: 100,
      balanceBefore: 500,
      balanceAfter: 400,
    });
  });

  test("3. Approve Withdrawal - persist queue record and wake the worker", async () => {
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
    expect(approveRes.data.status).toBe(WITHDRAWAL_STATUS.PROCESSING);
    expect(approveRes.message).toMatch(/queued/i);

    // Verify Withdrawal is in PROCESSING state
    const withdrawal = await Withdrawal.findById(withdrawalId);
    expect(withdrawal.status).toBe(WITHDRAWAL_STATUS.PROCESSING);
    expect(withdrawal.payoutProvider).toBe(PAYOUT_PROVIDER.RAZORPAYX);
    const outbox = await PayoutOutbox.findOne({ withdrawalId });
    expect(outbox).toMatchObject({
      provider: withdrawal.payoutProvider,
      providerReferenceId: withdrawalId.toString(),
      status: "PENDING",
    });
  });

  test("4. Cancel Withdrawal - Refund points & CANCELLED status", async () => {
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
    expect(cancelRes.data.status).toBe(WITHDRAWAL_STATUS.CANCELLED);
    expect(cancelRes.data.refundedPoints).toBe(100);

    // Verify reward points were restored.
    const user = await User.findById(userId);
    expect(user.totalPoints).toBe(500);
    const refund = await LedgerEntry.findOne({
      withdrawalId,
      movement: PAYOUT_LEDGER_MOVEMENT.WITHDRAWAL_POINTS_REFUND,
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

    // Simulate a transfer that has already been submitted to the provider.
    await Withdrawal.findByIdAndUpdate(withdrawalId, {
      status: WITHDRAWAL_STATUS.PROCESSING,
      payoutProvider: PAYOUT_PROVIDER.RAZORPAYX,
      providerReferenceId: withdrawalId.toString(),
      providerTransferId: "pout_processed_123",
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
            amount: 20000,
            currency: "INR",
          },
        },
      },
    };

    const webhookRes = await processSignedWebhook(payload);
    expect(webhookRes.status).toBe("success");

    // Verify Withdrawal is COMPLETED
    const withdrawal = await Withdrawal.findById(withdrawalId);
    expect(withdrawal.status).toBe(WITHDRAWAL_STATUS.COMPLETED);
    expect(withdrawal.utr).toBe("UTR123456");

    // Verify User totalWithdraw updated
    const user = await User.findById(userId);
    expect(user.totalWithdraw).toBe(200); // ₹200 added
    const payoutLedger = await LedgerEntry.findOne({
      withdrawalId,
      movement: "PAYOUT_COMPLETED",
    });
    expect(payoutLedger).toBeDefined();
    expect(payoutLedger.toObject()).toMatchObject({
      amount: 200,
      asset: "INR",
      providerTransferId: "pout_processed_123",
    });
  });

  test("6. Webhook - payout.failed refunds points", async () => {
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

    // Simulate a transfer that has already been submitted to the provider.
    await Withdrawal.findByIdAndUpdate(withdrawalId, {
      status: WITHDRAWAL_STATUS.PROCESSING,
      payoutProvider: PAYOUT_PROVIDER.RAZORPAYX,
      providerReferenceId: withdrawalId.toString(),
      providerTransferId: "pout_failed_123",
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
            amount: 20000,
            currency: "INR",
          },
        },
      },
    };

    const webhookRes = await processSignedWebhook(failedPayload);
    expect(webhookRes.status).toBe("success");

    // Verify Withdrawal is FAILED
    const withdrawal = await Withdrawal.findById(withdrawalId);
    expect(withdrawal.status).toBe(WITHDRAWAL_STATUS.FAILED);
    expect(withdrawal.failureReason).toBe(
      "Insufficient balance in master account",
    );

    // Verify reward points were refunded to the user.
    const user = await User.findById(userId);
    expect(user.totalPoints).toBe(500);
    const refund = await LedgerEntry.findOne({
      withdrawalId,
      movement: PAYOUT_LEDGER_MOVEMENT.WITHDRAWAL_POINTS_REFUND,
    });
    expect(refund).toMatchObject({
      amount: 100,
      balanceBefore: 400,
      balanceAfter: 500,
    });
  });
});

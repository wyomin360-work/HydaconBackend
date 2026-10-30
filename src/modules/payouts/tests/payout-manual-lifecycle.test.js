jest.mock("../../../schemas/withdrawal.schema", () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../../schemas/user.schema", () => ({
  findById: jest.fn(),
}));
jest.mock("../../../schemas/user-bank-account.schema", () => ({
  updateOne: jest.fn(),
}));
jest.mock("../../../schemas/payout-attempt.schema", () => ({
  countDocuments: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock("../../../schemas/payout-outbox.schema", () => ({
  findOneAndUpdate: jest.fn(),
}));
jest.mock("../../../schemas/payout-recon.schema", () => ({
  create: jest.fn(),
}));
jest.mock("../../../schemas/app-config.schema", () => ({
  findOne: jest.fn(),
}));
jest.mock("../payout-record.service", () => ({
  createOrUpdatePayoutRecord: jest.fn(),
  syncPayoutRecord: jest.fn(),
}));
jest.mock("../../../functions/payouts", () => ({
  getProvider: jest.fn(),
  currentProviderName: jest.fn(),
}));
jest.mock("../payout-state.service", () => ({
  applyTransferUpdate: jest.fn(),
  loadPendingManualPayout: jest.fn(),
}));
jest.mock("../payout-alerts", () => ({
  reportPayoutAlert: jest.fn(),
}));

const mongoose = require("mongoose");
const Withdrawal = require("../../../schemas/withdrawal.schema");
const User = require("../../../schemas/user.schema");
const PayoutAttempt = require("../../../schemas/payout-attempt.schema");
const PayoutOutbox = require("../../../schemas/payout-outbox.schema");
const AppConfig = require("../../../schemas/app-config.schema");
const {
  createOrUpdatePayoutRecord,
  syncPayoutRecord,
} = require("../payout-record.service");
const { getProvider, currentProviderName } = require("../../../functions/payouts");
const { loadPendingManualPayout } = require("../payout-state.service");
const {
  enqueueApprovedWithdrawal,
  convertManualPayoutToProvider,
} = require("../payout-execution.service");
const {
  PAYOUT_METHOD,
  PAYOUT_PROVIDER,
  PAYOUT_APPROVAL_SOURCE,
  PAYOUT_OUTBOX_STATUS,
} = require("../../../constants/payouts");
const { WITHDRAWAL_STATUS } = require("../../../constants/withdrawals");
const { KYC_STATUS } = require("../../../constants/user");

describe("manual payout lifecycle", () => {
  const withdrawalId = "withdrawal-123";
  const adminId = "admin-123";
  let session;
  let withdrawal;
  let configuredMethod;

  beforeEach(() => {
    jest.clearAllMocks();
    configuredMethod = PAYOUT_METHOD.PROVIDER;
    withdrawal = {
      _id: withdrawalId,
      userId: "user-123",
      status: WITHDRAWAL_STATUS.PENDING,
      cashAmount: 500,
      save: jest.fn().mockResolvedValue(undefined),
    };

    session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);

    Withdrawal.findOne.mockReturnValue({
      session: jest.fn().mockResolvedValue(withdrawal),
    });
    User.findById.mockReturnValue({
      session: jest.fn().mockResolvedValue({ kycStatus: KYC_STATUS.APPROVED }),
    });
    AppConfig.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockImplementation(async () => ({
        payoutSettings: { defaultPayoutMethod: configuredMethod },
      })),
    });
    Withdrawal.updateOne.mockResolvedValue({ modifiedCount: 1 });
    createOrUpdatePayoutRecord.mockResolvedValue({});
    PayoutOutbox.findOneAndUpdate.mockResolvedValue({});
    currentProviderName.mockReturnValue(PAYOUT_PROVIDER.CASHFREE);
    getProvider.mockReturnValue({ validateConfig: jest.fn() });
    loadPendingManualPayout.mockResolvedValue({
      payout: { status: WITHDRAWAL_STATUS.PENDING },
      withdrawal: {
        _id: withdrawalId,
        status: WITHDRAWAL_STATUS.PROCESSING,
        isManualPayout: true,
        providerReferenceId: withdrawalId,
      },
    });
    syncPayoutRecord.mockResolvedValue({ modifiedCount: 1 });
  });

  afterEach(() => jest.restoreAllMocks());

  test.each([
    ["explicit manual selection", PAYOUT_METHOD.PROVIDER, PAYOUT_METHOD.MANUAL],
    ["manual system default", PAYOUT_METHOD.MANUAL, null],
  ])("creates a pending manual payout for %s without provider execution", async (_label, defaultMethod, requestedMethod) => {
    configuredMethod = defaultMethod;

    const result = await enqueueApprovedWithdrawal(
      adminId,
      withdrawalId,
      PAYOUT_APPROVAL_SOURCE.ADMIN,
      requestedMethod,
    );

    expect(result).toMatchObject({
      status: WITHDRAWAL_STATUS.PROCESSING,
      payoutProvider: PAYOUT_PROVIDER.MANUAL,
      payoutMethod: PAYOUT_METHOD.MANUAL,
      isManualPayout: true,
      shouldWakeWorker: false,
    });
    expect(withdrawal).toMatchObject({
      payoutProvider: PAYOUT_PROVIDER.MANUAL,
      payoutMethod: PAYOUT_METHOD.MANUAL,
      isManualPayout: true,
      createdByAdminId: adminId,
      approvedBy: adminId,
      approvalSource: PAYOUT_APPROVAL_SOURCE.ADMIN,
    });
    expect(createOrUpdatePayoutRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        approval: expect.objectContaining({
          status: WITHDRAWAL_STATUS.PENDING,
          provider: PAYOUT_PROVIDER.MANUAL,
          payoutMethod: PAYOUT_METHOD.MANUAL,
          isManualPayout: true,
          createdByAdminId: adminId,
        }),
        session,
      }),
    );
    expect(PayoutOutbox.findOneAndUpdate).not.toHaveBeenCalled();
    expect(getProvider).not.toHaveBeenCalled();
  });

  test("converts only a pending manual payout and queues it with the configured provider", async () => {
    const providerAdapter = { validateConfig: jest.fn() };
    currentProviderName.mockReturnValue(PAYOUT_PROVIDER.CASHFREE);
    getProvider.mockReturnValue(providerAdapter);

    const result = await convertManualPayoutToProvider(adminId, withdrawalId);

    expect(loadPendingManualPayout).toHaveBeenCalledWith(withdrawalId, session);
    expect(Withdrawal.updateOne).toHaveBeenCalledWith(
      {
        _id: withdrawalId,
        status: WITHDRAWAL_STATUS.PROCESSING,
        isManualPayout: true,
      },
      {
        $set: {
          payoutProvider: PAYOUT_PROVIDER.CASHFREE,
          payoutMethod: PAYOUT_METHOD.PROVIDER,
          isManualPayout: false,
          providerReferenceId: withdrawalId,
        },
      },
      { session },
    );
    expect(syncPayoutRecord).toHaveBeenCalledWith(
      withdrawalId,
      expect.objectContaining({
        payoutProvider: PAYOUT_PROVIDER.CASHFREE,
        payoutMethod: PAYOUT_METHOD.PROVIDER,
        isManualPayout: false,
        convertedToProviderByAdminId: adminId,
      }),
      session,
    );
    expect(PayoutOutbox.findOneAndUpdate).toHaveBeenCalledWith(
      { withdrawalId },
      expect.objectContaining({
        $set: expect.objectContaining({
          provider: PAYOUT_PROVIDER.CASHFREE,
          status: PAYOUT_OUTBOX_STATUS.PENDING,
        }),
        $setOnInsert: { withdrawalId },
      }),
      expect.objectContaining({ upsert: true, session }),
    );
    expect(result).toMatchObject({
      manualPayoutConverted: true,
      data: {
        id: withdrawalId,
        payoutProvider: PAYOUT_PROVIDER.CASHFREE,
        providerReferenceId: withdrawalId,
      },
    });
  });

  test("rejects conversion when the manual payout is not eligible", async () => {
    const error = new Error("This action is only available for a pending manual payout");
    loadPendingManualPayout.mockRejectedValueOnce(error);

    await expect(
      convertManualPayoutToProvider(adminId, withdrawalId),
    ).rejects.toThrow(error.message);

    expect(Withdrawal.updateOne).not.toHaveBeenCalled();
    expect(syncPayoutRecord).not.toHaveBeenCalled();
    expect(PayoutOutbox.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

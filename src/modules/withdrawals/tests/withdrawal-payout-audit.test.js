const mongoose = require("mongoose");

jest.mock("../../../schemas/withdrawal.schema", () => ({
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  findById: jest.fn(),
}));
jest.mock("../../../schemas/user-bank-account.schema", () => ({}));
jest.mock("../../../schemas/user.schema", () => ({}));
jest.mock("../../../schemas/app-config.schema", () => ({}));
jest.mock("../../../schemas/ledger-entry.schema", () => ({}));
jest.mock("../../../schemas/payout-event.schema", () => ({}));
jest.mock("../../../schemas/payout-recon.schema", () => ({}));
jest.mock("../../../schemas/payout-attempt.schema", () => {
  const Attempt = jest.fn().mockImplementation(function (data) {
    Object.assign(this, data);
    this._id = "attempt-123";
    this.save = jest.fn().mockResolvedValue(this);
  });
  Attempt.updateOne = jest.fn().mockResolvedValue({ matchedCount: 1 });
  return Attempt;
});
jest.mock("../../../functions/razorpayx", () => ({
  createPayoutContact: jest.fn(),
  createPayoutFundAccount: jest.fn(),
  createPayout: jest.fn(),
  createIdempotencyKey: jest.fn(() => "stable-payout-key"),
}));
jest.mock("../../../functions/fcm", () => ({
  sendFcmNotifications: jest.fn(),
}));
jest.mock("../../../utils/responseHandlers", () => ({
  sendFailResponse: jest.fn((message) => {
    throw new Error(message);
  }),
}));

const Withdrawal = require("../../../schemas/withdrawal.schema");
const PayoutAttempt = require("../../../schemas/payout-attempt.schema");
const { createPayout } = require("../../../functions/razorpayx");
const service = require("../withdrawals.service");

describe("withdrawal payout attempt audit", () => {
  const withdrawalId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  let withdrawal;
  let session;
  let populateQuery;

  beforeEach(() => {
    jest.clearAllMocks();
    withdrawal = {
      _id: withdrawalId,
      userId: {
        _id: new mongoose.Types.ObjectId(),
        payoutContactId: "cont_existing",
        fcmTokens: [],
        enableNotification: false,
      },
      bankAccountId: {
        _id: new mongoose.Types.ObjectId(),
        payoutFundAccountId: "fa_existing",
      },
      cashAmount: 250,
      payoutAttemptCount: 0,
    };
    populateQuery = {
      populate: jest.fn().mockReturnThis(),
    };
    Withdrawal.findOneAndUpdate
      .mockImplementationOnce(() => {
        populateQuery.populate.mockImplementation((field) =>
          field === "bankAccountId"
            ? Promise.resolve(withdrawal)
            : populateQuery,
        );
        return populateQuery;
      })
      .mockResolvedValueOnce({ payoutAttemptCount: 1 });
    Withdrawal.updateOne.mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });
    Withdrawal.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ status: "PROCESSING" }),
    });
    PayoutAttempt.updateOne.mockResolvedValue({ matchedCount: 1 });
    createPayout.mockResolvedValue({
      id: "pout_new_123",
      status: "queued",
      _httpStatus: 200,
    });
    session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
  });

  afterEach(() => jest.restoreAllMocks());

  test("persists a request attempt and safe provider response", async () => {
    const result = await service.approveWithdrawal(adminId, withdrawalId);

    expect(result.data.providerPayoutId).toBe("pout_new_123");
    expect(PayoutAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        withdrawalId,
        attemptNumber: 1,
        adminId,
        idempotencyKey: "stable-payout-key",
        amount: 25000,
        currency: "INR",
        mode: "IMPS",
        outcome: "REQUESTED",
      }),
    );
    expect(PayoutAttempt.updateOne).toHaveBeenCalledWith(
      { _id: "attempt-123" },
      expect.objectContaining({
        $set: expect.objectContaining({
          outcome: "SUCCEEDED",
          httpStatus: 200,
          payoutId: "pout_new_123",
          providerResponse: expect.objectContaining({
            id: "pout_new_123",
            status: "queued",
          }),
        }),
      }),
      { session },
    );
    expect(Withdrawal.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: withdrawalId }),
      { $set: { providerPayoutId: "pout_new_123" } },
      { session },
    );
  });

  test("records ambiguous provider failures and keeps the withdrawal claimed", async () => {
    const timeout = new Error("socket timeout");
    timeout.definitive = false;
    createPayout.mockRejectedValueOnce(timeout);

    await expect(
      service.approveWithdrawal(adminId, withdrawalId),
    ).rejects.toThrow("socket timeout");

    expect(PayoutAttempt.updateOne).toHaveBeenCalledWith(
      { _id: "attempt-123" },
      expect.objectContaining({
        $set: expect.objectContaining({ outcome: "AMBIGUOUS_FAILURE" }),
      }),
    );
    expect(Withdrawal.updateOne).not.toHaveBeenCalled();
  });

  test("records definitive provider rejections and releases the claim", async () => {
    const rejected = new Error("Invalid fund account");
    rejected.providerStatusCode = 400;
    rejected.definitive = true;
    createPayout.mockRejectedValueOnce(rejected);

    await expect(
      service.approveWithdrawal(adminId, withdrawalId),
    ).rejects.toThrow("Invalid fund account");

    expect(PayoutAttempt.updateOne).toHaveBeenCalledWith(
      { _id: "attempt-123" },
      expect.objectContaining({
        $set: expect.objectContaining({
          outcome: "DEFINITIVE_FAILURE",
          httpStatus: 400,
        }),
      }),
    );
    expect(Withdrawal.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PROCESSING", providerPayoutId: null }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: "PENDING" }),
      }),
    );
  });
});

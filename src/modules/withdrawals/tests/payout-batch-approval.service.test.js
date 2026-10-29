jest.mock("../../../schemas/withdrawal.schema", () => ({
  find: jest.fn(),
  updateMany: jest.fn(),
}));
jest.mock("../../../schemas/payout-outbox.schema", () => ({
  bulkWrite: jest.fn(),
}));
jest.mock("../../../schemas/payout-batch.schema", () => {
  const PayoutBatch = jest.fn().mockImplementation(function (data) {
    Object.assign(this, data);
    this._id = "batch-123";
    this.save = jest.fn().mockResolvedValue(this);
  });
  return PayoutBatch;
});
jest.mock("../../../functions/payouts", () => ({
  currentProviderName: jest.fn(() => "cashfree"),
  getProvider: jest.fn(() => ({
    validateConfig: jest.fn(),
    initiateBatchTransfer: jest.fn(),
  })),
}));
jest.mock("../payout-execution.service", () => ({
  amountInMinorUnits: jest.fn((withdrawal) =>
    Math.round(withdrawal.cashAmount * 100),
  ),
}));
jest.mock("../payout-batch-worker.service", () => ({
  wakePayoutBatchWorker: jest.fn(),
}));

const mongoose = require("mongoose");
const Withdrawal = require("../../../schemas/withdrawal.schema");
const PayoutOutbox = require("../../../schemas/payout-outbox.schema");
const PayoutBatch = require("../../../schemas/payout-batch.schema");
const { wakePayoutBatchWorker } = require("../payout-batch-worker.service");
const {
  enqueueApprovedWithdrawalBatch,
} = require("../payout-batch-approval.service");

describe("Cashfree batch approval", () => {
  const withdrawalIds = ["withdrawal-1", "withdrawal-2"];
  const adminId = "admin-1";
  let session;
  let withdrawals;
  let committed;

  beforeEach(() => {
    jest.clearAllMocks();
    committed = false;
    withdrawals = withdrawalIds.map((id) => ({
      _id: id,
      status: "PENDING",
      cashAmount: 25.5,
      userId: { _id: `user-${id}` },
      bankAccountId: { userId: `user-${id}`, isActive: true },
    }));

    const query = {
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(withdrawals),
    };
    Withdrawal.find.mockReturnValue(query);
    Withdrawal.updateMany.mockResolvedValue({
      modifiedCount: withdrawalIds.length,
    });
    PayoutOutbox.bulkWrite.mockResolvedValue({});

    session = {
      withTransaction: jest.fn(async (callback) => {
        await callback();
        committed = true;
      }),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    wakePayoutBatchWorker.mockImplementation(() => {
      expect(committed).toBe(true);
    });
  });

  afterEach(() => jest.restoreAllMocks());

  test("commits the complete valid set before waking the batch worker", async () => {
    const result = await enqueueApprovedWithdrawalBatch(adminId, withdrawalIds);

    expect(result).toMatchObject({
      batchId: "batch-123",
      status: "PROCESSING",
      payoutProvider: "cashfree",
      withdrawalIds,
    });
    expect(Withdrawal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: { $in: withdrawalIds },
        status: "PENDING",
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "PROCESSING",
          payoutProvider: "cashfree",
          approvedBy: adminId,
        }),
      }),
      { session },
    );
    expect(PayoutBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        batchReferenceId: expect.stringMatching(/^hydacon_[a-f0-9]{32}$/),
        withdrawalCount: withdrawalIds.length,
        adminId,
      }),
    );
    expect(PayoutOutbox.bulkWrite).toHaveBeenCalledTimes(1);
    expect(wakePayoutBatchWorker).toHaveBeenCalledTimes(1);
  });

  test("does not partially approve a set containing an ineligible withdrawal", async () => {
    withdrawals[1].status = "COMPLETED";

    await expect(
      enqueueApprovedWithdrawalBatch(adminId, withdrawalIds),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(Withdrawal.updateMany).not.toHaveBeenCalled();
    expect(PayoutBatch).not.toHaveBeenCalled();
    expect(PayoutOutbox.bulkWrite).not.toHaveBeenCalled();
    expect(wakePayoutBatchWorker).not.toHaveBeenCalled();
  });
});

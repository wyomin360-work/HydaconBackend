jest.mock("../../../schemas/withdrawal.schema", () => ({
  findById: jest.fn(),
}));
jest.mock("../../payouts/payout-execution.service", () => ({
  enqueueApprovedWithdrawal: jest.fn(),
  wakePayoutOutboxWorker: jest.fn(),
}));
jest.mock("../../../functions/fcm", () => ({
  sendFcmNotifications: jest.fn(),
}));
jest.mock("../../../utils/responseHandlers", () => ({
  sendFailResponse: jest.fn((message, statusCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
  }),
}));

const Withdrawal = require("../../../schemas/withdrawal.schema");
const {
  enqueueApprovedWithdrawal,
  wakePayoutOutboxWorker,
} = require("../../payouts/payout-execution.service");
const service = require("../withdrawals.service");

describe("withdrawal payout approval queue", () => {
  const withdrawalId = "withdrawal-123";
  const adminId = "admin-123";

  beforeEach(() => {
    jest.clearAllMocks();
    enqueueApprovedWithdrawal.mockResolvedValue({
      id: withdrawalId,
      status: "PROCESSING",
      payoutProvider: "razorpayx",
    });

    const query = {
      populate: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        status: "PROCESSING",
        userId: { fcmTokens: [], enableNotification: false },
      }),
    };
    Withdrawal.findById.mockReturnValue(query);
  });

  test("wakes the outbox worker after approval has been durably queued", async () => {
    const result = await service.approveWithdrawal(adminId, withdrawalId);

    expect(enqueueApprovedWithdrawal).toHaveBeenCalledWith(
      adminId,
      withdrawalId,
    );
    expect(wakePayoutOutboxWorker).toHaveBeenCalledTimes(1);
    expect(result.data).toMatchObject({
      id: withdrawalId,
      status: "PROCESSING",
      payoutProvider: "razorpayx",
    });
    expect(result.message).toMatch(/queued/i);
  });

  test("does not wake the worker when durable approval fails", async () => {
    enqueueApprovedWithdrawal.mockRejectedValueOnce(
      new Error("Approval transaction failed"),
    );

    await expect(
      service.approveWithdrawal(adminId, withdrawalId),
    ).rejects.toThrow("Approval transaction failed");

    expect(wakePayoutOutboxWorker).not.toHaveBeenCalled();
  });
});

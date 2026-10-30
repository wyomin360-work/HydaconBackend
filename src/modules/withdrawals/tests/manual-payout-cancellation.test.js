jest.mock("../../../schemas/withdrawal.schema", () => ({
  findById: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../../schemas/payout.schema", () => ({
  findOne: jest.fn(),
}));
jest.mock("../../../schemas/payout-attempt.schema", () => ({
  countDocuments: jest.fn(),
}));
jest.mock("../../../schemas/user.schema", () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock("../../../schemas/points-ledger.schema", () => ({
  create: jest.fn(),
}));
jest.mock("../../../schemas/ledger-entry.schema", () => ({
  create: jest.fn(),
}));
jest.mock("../../../functions/fcm", () => ({
  sendFcmNotifications: jest.fn().mockResolvedValue({ errors: [] }),
}));
jest.mock("../../payouts/payout-record.service", () => ({
  syncPayoutRecord: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  createOrUpdatePayoutRecord: jest.fn(),
}));
jest.mock("../../payouts/payout-execution.service", () => ({
  enqueueApprovedWithdrawal: jest.fn(),
  wakePayoutOutboxWorker: jest.fn(),
  getVerifiedBankAccountBeneficiary: jest.fn(),
}));
jest.mock("../../payouts/payout-batch.service", () => ({
  enqueueApprovedWithdrawalBatch: jest.fn(),
}));

const mongoose = require("mongoose");
const Withdrawal = require("../../../schemas/withdrawal.schema");
const Payout = require("../../../schemas/payout.schema");
const PayoutAttempt = require("../../../schemas/payout-attempt.schema");
const User = require("../../../schemas/user.schema");
const PointsLedger = require("../../../schemas/points-ledger.schema");
const LedgerEntry = require("../../../schemas/ledger-entry.schema");
const { syncPayoutRecord } = require("../../payouts/payout-record.service");
const { cancelApprovedManualPayout } = require("../withdrawals.service");
const {
  PAYOUT_ASSET,
  PAYOUT_LEDGER_MOVEMENT,
  PAYOUT_LEDGER_SOURCE,
  PAYOUT_METHOD,
} = require("../../../constants/payouts");
const { WITHDRAWAL_STATUS } = require("../../../constants/withdrawals");
const {
  POINTS_TRANSACTION_REASON,
  POINTS_TRANSACTION_TYPE,
} = require("../../../constants/points");

describe("manual payout cancellation", () => {
  const withdrawalId = "withdrawal-123";
  const adminId = "admin-456";
  const remarks = "Incorrect beneficiary details supplied";
  let session;
  let withdrawal;
  let user;
  let payout;

  beforeEach(() => {
    jest.clearAllMocks();
    withdrawal = {
      _id: withdrawalId,
      userId: "user-123",
      pointsAmount: 1670,
      cashAmount: 250,
      status: WITHDRAWAL_STATUS.PROCESSING,
      isManualPayout: true,
    };
    user = { _id: "user-123", totalPoints: 1000, fcmTokens: [] };
    payout = {
      status: WITHDRAWAL_STATUS.PENDING,
      isManualPayout: true,
      payoutMethod: PAYOUT_METHOD.MANUAL,
    };
    session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    Withdrawal.findById.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      session: jest.fn().mockResolvedValue(withdrawal),
    });
    Payout.findOne.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      session: jest.fn().mockResolvedValue(payout),
    });
    PayoutAttempt.countDocuments.mockReturnValue({
      session: jest.fn().mockResolvedValue(0),
    });
    User.findById.mockReturnValue({
      session: jest.fn().mockResolvedValue(user),
    });
    Withdrawal.updateOne.mockResolvedValue({ modifiedCount: 1 });
    User.findOneAndUpdate.mockResolvedValue({ totalPoints: 1000 });
    PointsLedger.create.mockResolvedValue([]);
    LedgerEntry.create.mockResolvedValue([]);
  });

  afterEach(() => jest.restoreAllMocks());

  test("cancels a pending manual payout and refunds points exactly once", async () => {
    const result = await cancelApprovedManualPayout(
      adminId,
      withdrawalId,
      remarks,
    );

    expect(result).toMatchObject({
      payoutCancelled: true,
      data: {
        id: withdrawalId,
        status: WITHDRAWAL_STATUS.CANCELLED,
        refundsPoints: true,
        refundAmount: withdrawal.pointsAmount,
      },
    });
    expect(Withdrawal.updateOne).toHaveBeenCalledWith(
      { _id: withdrawalId, status: WITHDRAWAL_STATUS.PROCESSING },
      {
        $set: expect.objectContaining({
          status: WITHDRAWAL_STATUS.CANCELLED,
          remarks,
          cancelledBy: adminId,
          cancelledAt: expect.any(Date),
        }),
      },
      { session },
    );
    expect(syncPayoutRecord).toHaveBeenCalledWith(
      withdrawalId,
      expect.objectContaining({ status: WITHDRAWAL_STATUS.CANCELLED, remarks }),
      session,
    );
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: user._id },
      { $inc: { totalPoints: withdrawal.pointsAmount } },
      { new: false, session },
    );
    expect(PointsLedger.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          amount: withdrawal.pointsAmount,
          transactionType: POINTS_TRANSACTION_TYPE.CREDIT,
          reason: POINTS_TRANSACTION_REASON.REFUND,
          balance: user.totalPoints + withdrawal.pointsAmount,
        }),
      ],
      { session },
    );
    expect(LedgerEntry.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          entryKey: `withdrawal:${withdrawalId}:points-refund:cancelled`,
          movement: PAYOUT_LEDGER_MOVEMENT.WITHDRAWAL_POINTS_REFUND,
          asset: PAYOUT_ASSET.REWARD_POINT,
          amount: withdrawal.pointsAmount,
          source: PAYOUT_LEDGER_SOURCE.ADMIN_CANCELLATION,
        }),
      ],
      { session },
    );
  });

  test("does not cancel if the payout has provider activity", async () => {
    PayoutAttempt.countDocuments.mockReturnValueOnce({
      session: jest.fn().mockResolvedValue(1),
    });

    await expect(
      cancelApprovedManualPayout(adminId, withdrawalId, remarks),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(Withdrawal.updateOne).not.toHaveBeenCalled();
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(PointsLedger.create).not.toHaveBeenCalled();
  });

  test("rejects cancellation when the target payout is not manual", async () => {
    payout.isManualPayout = false;

    await expect(
      cancelApprovedManualPayout(adminId, withdrawalId, remarks),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(Withdrawal.updateOne).not.toHaveBeenCalled();
    expect(PointsLedger.create).not.toHaveBeenCalled();
  });
});

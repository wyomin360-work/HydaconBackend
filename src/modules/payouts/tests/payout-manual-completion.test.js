jest.mock("../../../schemas/withdrawal.schema", () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../../schemas/payout.schema", () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../../schemas/payout-attempt.schema", () => ({
  countDocuments: jest.fn(),
}));
jest.mock("../../../schemas/payout-outbox.schema", () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../../schemas/payout-event.schema", () => ({
  updateOne: jest.fn(),
}));
jest.mock("../../../schemas/user.schema", () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock("../../../schemas/ledger-entry.schema", () => ({
  create: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock("../../../schemas/points-ledger.schema", () => ({
  create: jest.fn(),
}));
jest.mock("../../../functions/fcm", () => ({
  sendFcmNotifications: jest.fn().mockResolvedValue({ errors: [] }),
}));
jest.mock("../../../functions/nodemailer", () => ({
  sendTemplateEmail: jest.fn().mockResolvedValue(true),
}));
jest.mock("../payout-record.service", () => ({
  syncPayoutRecord: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
}));
jest.mock("../payout-alerts", () => ({ reportPayoutAlert: jest.fn() }));

const mongoose = require("mongoose");
const Withdrawal = require("../../../schemas/withdrawal.schema");
const Payout = require("../../../schemas/payout.schema");
const PayoutAttempt = require("../../../schemas/payout-attempt.schema");
const PayoutOutbox = require("../../../schemas/payout-outbox.schema");
const User = require("../../../schemas/user.schema");
const LedgerEntry = require("../../../schemas/ledger-entry.schema");
const { syncPayoutRecord } = require("../payout-record.service");
const {
  completeManualPayout,
  completeManualReviewPayout,
} = require("../payout-state.service");
const {
  PAYOUT_ASSET,
  PAYOUT_LEDGER_MOVEMENT,
  PAYOUT_LEDGER_SOURCE,
  PAYOUT_METHOD,
  PAYOUT_PROVIDER,
  PAYOUT_OUTBOX_STATUS,
  PAYOUT_MANUAL_REVIEW_RESOLUTION,
} = require("../../../constants/payouts");
const { WITHDRAWAL_STATUS } = require("../../../constants/withdrawals");

describe("manual payout completion", () => {
  const withdrawalId = "withdrawal-123";
  const adminId = "admin-456";
  let session;
  let withdrawal;

  beforeEach(() => {
    jest.clearAllMocks();
    withdrawal = {
      _id: withdrawalId,
      userId: "user-123",
      cashAmount: 250,
      pointsAmount: 1670,
      status: WITHDRAWAL_STATUS.PROCESSING,
      isManualPayout: true,
      providerTransferId: null,
    };
    session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);

    Payout.findOne.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      session: jest.fn().mockResolvedValue({
        status: WITHDRAWAL_STATUS.PENDING,
        payoutMethod: PAYOUT_METHOD.MANUAL,
        isManualPayout: true,
      }),
    });
    Withdrawal.findOne.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      session: jest.fn().mockResolvedValue(withdrawal),
    });
    PayoutAttempt.countDocuments.mockReturnValue({
      session: jest.fn().mockResolvedValue(0),
    });
    Withdrawal.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Payout.updateOne.mockResolvedValue({ modifiedCount: 1 });
    PayoutOutbox.updateOne.mockResolvedValue({ modifiedCount: 1 });
    User.findOneAndUpdate.mockResolvedValue({ totalWithdraw: 0 });
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    LedgerEntry.create.mockResolvedValue([]);
  });

  afterEach(() => jest.restoreAllMocks());

  test("records settlement actor and reference with the INR ledger entry", async () => {
    const result = await completeManualPayout(adminId, withdrawalId, {
      paymentReference: "BANK-SETTLEMENT-2026-42",
      utr: "UTR-987654",
      notes: "Paid in the daily settlement run",
    });

    expect(result).toMatchObject({
      manualPayoutCompleted: true,
      data: { id: withdrawalId, status: WITHDRAWAL_STATUS.COMPLETED },
    });
    expect(Withdrawal.updateOne).toHaveBeenCalledWith(
      {
        _id: withdrawalId,
        status: WITHDRAWAL_STATUS.PROCESSING,
        isManualPayout: true,
      },
      {
        $set: expect.objectContaining({
          status: WITHDRAWAL_STATUS.COMPLETED,
          utr: "UTR-987654",
          manualPaymentReference: "BANK-SETTLEMENT-2026-42",
          manualCompletionNotes: "Paid in the daily settlement run",
          manualCompletedByAdminId: adminId,
          manualCompletedAt: expect.any(Date),
        }),
      },
      { session },
    );
    expect(syncPayoutRecord).toHaveBeenCalledWith(
      withdrawalId,
      expect.objectContaining({
        status: WITHDRAWAL_STATUS.COMPLETED,
        manualCompletedByAdminId: adminId,
        manualPaymentReference: "BANK-SETTLEMENT-2026-42",
      }),
      session,
    );
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: withdrawal.userId },
      { $inc: { totalWithdraw: withdrawal.cashAmount } },
      { new: false, session },
    );
    expect(LedgerEntry.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          entryKey: `withdrawal:${withdrawalId}:payout-completed`,
          movement: PAYOUT_LEDGER_MOVEMENT.PAYOUT_COMPLETED,
          asset: PAYOUT_ASSET.INR,
          amount: withdrawal.cashAmount,
          source: PAYOUT_LEDGER_SOURCE.MANUAL_PAYOUT,
          sourceId: adminId,
          metadata: expect.objectContaining({
            provider: PAYOUT_PROVIDER.MANUAL,
            utr: "UTR-987654",
          }),
        }),
      ],
      { session },
    );
  });

  test("rejects a missing payment reference before starting a transaction", async () => {
    await expect(
      completeManualPayout(adminId, withdrawalId, { paymentReference: " " }),
    ).rejects.toThrow(/reference/i);

    expect(mongoose.startSession).not.toHaveBeenCalled();
    expect(Withdrawal.updateOne).not.toHaveBeenCalled();
    expect(LedgerEntry.create).not.toHaveBeenCalled();
  });

  test("completes an exhausted provider payout from review with admin audit", async () => {
    withdrawal.status = WITHDRAWAL_STATUS.REQUIRES_REVIEW;
    withdrawal.isManualPayout = false;
    Payout.findOne.mockReturnValueOnce({
      lean: jest.fn().mockReturnThis(),
      session: jest
        .fn()
        .mockResolvedValue({ status: WITHDRAWAL_STATUS.REQUIRES_REVIEW }),
    });
    Withdrawal.findOne.mockReturnValueOnce({
      lean: jest.fn().mockReturnThis(),
      session: jest.fn().mockResolvedValue(withdrawal),
    });
    PayoutOutbox.findOne.mockReturnValueOnce({
      lean: jest.fn().mockReturnThis(),
      session: jest.fn().mockResolvedValue({
        _id: "outbox-123",
        status: PAYOUT_OUTBOX_STATUS.FAILED,
        manualReviewRequired: true,
      }),
    });

    const result = await completeManualReviewPayout(adminId, withdrawalId, {
      confirmation: true,
      paymentReference: "BANK-SETTLEMENT-REVIEW-42",
      utr: "UTR-REVIEW-42",
      notes: "Provider checked; settled manually",
    });

    expect(result.manualReviewPayoutCompleted).toBe(true);
    expect(Withdrawal.updateOne).toHaveBeenCalledWith(
      { _id: withdrawalId, status: WITHDRAWAL_STATUS.REQUIRES_REVIEW },
      {
        $set: expect.objectContaining({
          status: WITHDRAWAL_STATUS.COMPLETED,
          payoutMethod: PAYOUT_METHOD.MANUAL,
          manualPaymentReference: "BANK-SETTLEMENT-REVIEW-42",
          manualCompletedByAdminId: adminId,
        }),
      },
      { session },
    );
    expect(PayoutOutbox.updateOne).toHaveBeenCalledWith(
      {
        _id: "outbox-123",
        status: PAYOUT_OUTBOX_STATUS.FAILED,
        manualReviewRequired: true,
      },
      {
        $set: expect.objectContaining({
          manualReviewRequired: false,
          manualReviewResolvedByAdminId: adminId,
          manualReviewResolution:
            PAYOUT_MANUAL_REVIEW_RESOLUTION.MANUAL_SETTLEMENT,
        }),
      },
      { session },
    );
    expect(LedgerEntry.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          movement: PAYOUT_LEDGER_MOVEMENT.PAYOUT_COMPLETED,
        }),
      ],
      { session },
    );
  });

  test("requires an explicit provider and settlement confirmation", async () => {
    await expect(
      completeManualReviewPayout(adminId, withdrawalId, {
        paymentReference: "BANK-SETTLEMENT-REVIEW-42",
      }),
    ).rejects.toThrow(/confirm/i);

    expect(mongoose.startSession).not.toHaveBeenCalled();
    expect(LedgerEntry.create).not.toHaveBeenCalled();
  });

  test("does not complete a payout after a provider attempt exists", async () => {
    PayoutAttempt.countDocuments.mockReturnValueOnce({
      session: jest.fn().mockResolvedValue(1),
    });

    await expect(
      completeManualPayout(adminId, withdrawalId, {
        paymentReference: "BANK-SETTLEMENT-2026-42",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(Withdrawal.updateOne).not.toHaveBeenCalled();
    expect(LedgerEntry.create).not.toHaveBeenCalled();
  });
});

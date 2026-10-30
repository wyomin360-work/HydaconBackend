jest.mock("../../../schemas/withdrawal.schema", () => ({
  findById: jest.fn(),
}));
jest.mock("../../../schemas/payout-attempt.schema", () => ({
  findOne: jest.fn(),
}));
jest.mock("../../../schemas/payout-outbox.schema", () => ({
  updateOne: jest.fn(),
}));
jest.mock("../../../schemas/payout-recon.schema", () => ({
  create: jest.fn(),
}));
jest.mock("../payout-state.service", () => ({
  applyTransferUpdate: jest.fn(),
}));

const mongoose = require("mongoose");
const Withdrawal = require("../../../schemas/withdrawal.schema");
const PayoutAttempt = require("../../../schemas/payout-attempt.schema");
const PayoutOutbox = require("../../../schemas/payout-outbox.schema");
const PayoutRecon = require("../../../schemas/payout-recon.schema");
const { applyTransferUpdate } = require("../payout-state.service");
const { scheduleOutboxRetry } = require("../payout-execution.service");
const {
  PAYOUT_CONFIG,
  PAYOUT_OUTBOX_STATUS,
  PAYOUT_RECON_OUTCOME,
  PAYOUT_OPERATION,
} = require("../../../constants/payouts");
const { WITHDRAWAL_STATUS } = require("../../../constants/withdrawals");

describe("payout outbox retry policy", () => {
  const withdrawalId = "withdrawal-123";
  const outbox = {
    _id: "outbox-123",
    withdrawalId,
    provider: "cashfree",
    attempts: 1,
  };
  let session;
  let withdrawal;

  beforeEach(() => {
    jest.clearAllMocks();
    outbox.attempts = 1;
    withdrawal = {
      _id: withdrawalId,
      payoutProvider: "cashfree",
      providerReferenceId: withdrawalId,
      providerTransferId: null,
      payoutAttemptCount: 1,
      status: WITHDRAWAL_STATUS.PROCESSING,
    };
    const query = {
      select: jest.fn().mockReturnThis(),
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(withdrawal),
    };
    Withdrawal.findById.mockReturnValue(query);
    PayoutAttempt.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    PayoutOutbox.updateOne.mockResolvedValue({ modifiedCount: 1 });
    PayoutRecon.create.mockResolvedValue([{}]);
    applyTransferUpdate.mockResolvedValue({
      payoutStatus: WITHDRAWAL_STATUS.FAILED,
    });
    session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
  });

  afterEach(() => jest.restoreAllMocks());

  test("audits each failed worker attempt and schedules bounded backoff", async () => {
    const error = new Error("Cashfree IP is not whitelisted");
    error.providerStatusCode = 403;
    error.providerErrorCode = "IP_NOT_ALLOWED";
    error.payoutOperation = PAYOUT_OPERATION.TRANSFER_STATUS_LOOKUP;

    await scheduleOutboxRetry(outbox, error);

    expect(PayoutRecon.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          withdrawalId,
          provider: "cashfree",
          outcome: PAYOUT_RECON_OUTCOME.ERROR,
          retryAttempt: outbox.attempts,
          operation: PAYOUT_OPERATION.TRANSFER_STATUS_LOOKUP,
          providerStatusCode: 403,
          providerErrorCode: "IP_NOT_ALLOWED",
        }),
      ],
      { session },
    );
    expect(PayoutOutbox.updateOne).toHaveBeenCalledWith(
      { _id: outbox._id, status: PAYOUT_OUTBOX_STATUS.PROCESSING },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: PAYOUT_OUTBOX_STATUS.RECONCILIATION_REQUIRED,
          lastError: error.message,
          availableAt: expect.any(Date),
        }),
      }),
      { session },
    );
    expect(applyTransferUpdate).not.toHaveBeenCalled();
  });

  test("marks the withdrawal failed only after the retry cap and no request was sent", async () => {
    outbox.attempts = PAYOUT_CONFIG.OUTBOX_MAX_ATTEMPTS;
    withdrawal.payoutAttemptCount = 0;
    PayoutAttempt.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    const error = new Error("Beneficiary setup failed");

    await scheduleOutboxRetry(outbox, error);

    expect(PayoutOutbox.updateOne).toHaveBeenNthCalledWith(
      1,
      { _id: outbox._id, status: PAYOUT_OUTBOX_STATUS.PROCESSING },
      {
        $set: expect.objectContaining({
          status: PAYOUT_OUTBOX_STATUS.FAILED,
          retryExhaustedAt: expect.any(Date),
          manualReviewRequired: true,
        }),
      },
      { session },
    );
    expect(applyTransferUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        withdrawal,
        normalized: expect.objectContaining({
          targetStatus: WITHDRAWAL_STATUS.FAILED,
        }),
      }),
    );
    expect(PayoutOutbox.updateOne).toHaveBeenLastCalledWith(
      { _id: outbox._id, status: PAYOUT_OUTBOX_STATUS.FAILED },
      { $set: { manualReviewRequired: false } },
    );
  });

  test("stops automatic retries but requires review when a provider request may exist", async () => {
    outbox.attempts = PAYOUT_CONFIG.OUTBOX_MAX_ATTEMPTS;
    const error = new Error("Cashfree status lookup failed");

    await scheduleOutboxRetry(outbox, error);

    expect(PayoutOutbox.updateOne).toHaveBeenCalledWith(
      { _id: outbox._id, status: PAYOUT_OUTBOX_STATUS.PROCESSING },
      {
        $set: expect.objectContaining({
          status: PAYOUT_OUTBOX_STATUS.FAILED,
          manualReviewRequired: true,
        }),
      },
      { session },
    );
    expect(applyTransferUpdate).not.toHaveBeenCalled();
  });
});

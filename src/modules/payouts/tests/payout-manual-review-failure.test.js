jest.mock("../../../schemas/withdrawal.schema", () => ({
  findOne: jest.fn(),
}));
jest.mock("../../../schemas/payout-outbox.schema", () => ({
  findOne: jest.fn(),
}));
jest.mock("../../../schemas/payout-recon.schema", () => ({
  create: jest.fn().mockResolvedValue([]),
}));
jest.mock("../../../functions/payouts", () => ({
  getProvider: jest.fn(),
}));
jest.mock("../payout-record.service", () => ({ syncPayoutRecord: jest.fn() }));
jest.mock("../payout-alerts", () => ({ reportPayoutAlert: jest.fn() }));
jest.mock("../../../functions/fcm", () => ({
  sendFcmNotifications: jest.fn(),
}));
jest.mock("../../../functions/nodemailer", () => ({
  sendTemplateEmail: jest.fn(),
}));

const Withdrawal = require("../../../schemas/withdrawal.schema");
const PayoutOutbox = require("../../../schemas/payout-outbox.schema");
const PayoutRecon = require("../../../schemas/payout-recon.schema");
const { getProvider } = require("../../../functions/payouts");
const { failManualReviewPayout } = require("../payout-state.service");
const {
  PAYOUT_RECON_OUTCOME,
  PAYOUT_OUTBOX_STATUS,
} = require("../../../constants/payouts");
const { WITHDRAWAL_STATUS } = require("../../../constants/withdrawals");

describe("fail payout after manual review", () => {
  const withdrawal = {
    _id: "withdrawal-123",
    cashAmount: 125,
    payoutProvider: "cashfree",
    providerReferenceId: "reference-123",
  };
  const outbox = {
    status: PAYOUT_OUTBOX_STATUS.FAILED,
    manualReviewRequired: true,
  };
  const request = { confirmation: true, reason: "Provider confirmed failure" };
  let provider;

  beforeEach(() => {
    jest.clearAllMocks();
    Withdrawal.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(withdrawal),
    });
    PayoutOutbox.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(outbox),
    });
    provider = { getTransferStatus: jest.fn(), validateConfig: jest.fn() };
    getProvider.mockReturnValue(provider);
  });

  test("keeps the payout under review when the provider says it is still processing", async () => {
    provider.getTransferStatus.mockResolvedValue({
      targetStatus: WITHDRAWAL_STATUS.PROCESSING,
      status: "RECEIVED",
      providerReferenceId: withdrawal.providerReferenceId,
      providerTransferId: "transfer-123",
      amountMinor: 12500,
      currency: "INR",
    });

    await expect(
      failManualReviewPayout("admin-123", withdrawal._id, request),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("RECEIVED"),
    });

    expect(PayoutRecon.create).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: PAYOUT_RECON_OUTCOME.MATCHED,
        providerStatus: "RECEIVED",
      }),
    );
  });

  test("keeps the payout under review when no provider transfer is found", async () => {
    provider.getTransferStatus.mockResolvedValue(null);

    await expect(
      failManualReviewPayout("admin-123", withdrawal._id, request),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(PayoutRecon.create).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: PAYOUT_RECON_OUTCOME.NOT_FOUND }),
    );
  });

  test("does not refund or mark failed when provider lookup is unavailable", async () => {
    provider.getTransferStatus.mockRejectedValue(new Error("Provider timeout"));

    await expect(
      failManualReviewPayout("admin-123", withdrawal._id, request),
    ).rejects.toThrow("Provider timeout");

    expect(PayoutRecon.create).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: PAYOUT_RECON_OUTCOME.ERROR }),
    );
  });
});

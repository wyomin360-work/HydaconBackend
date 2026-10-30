jest.mock("../../../schemas/user.schema", () => ({
  findById: jest.fn(),
}));
jest.mock("../../../functions/fcm", () => ({
  sendFcmNotifications: jest
    .fn()
    .mockResolvedValue({ success: [], errors: [] }),
}));
jest.mock("../../../functions/nodemailer", () => ({
  sendTemplateEmail: jest.fn().mockResolvedValue(true),
}));

const User = require("../../../schemas/user.schema");
const { sendFcmNotifications } = require("../../../functions/fcm");
const { sendTemplateEmail } = require("../../../functions/nodemailer");
const { WITHDRAWAL_STATUS } = require("../../../constants/withdrawals");
const {
  PAYOUT_CONFIG,
  PAYOUT_EMAIL_TEMPLATE,
  PAYOUT_EMAIL_SUBJECT,
} = require("../../../constants/payouts");
const { notifyUserOfPayoutOutcome } = require("../payout-state.service");

describe("payout outcome notifications", () => {
  const withdrawal = {
    _id: "withdrawal-123",
    userId: "user-123",
    cashAmount: 500,
  };
  const user = {
    name: "Sam User",
    email: "sam@example.com",
    fcmTokens: ["fcm-token"],
    enableNotification: true,
    language: "en_US",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(user),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("sends FCM and a success email after payout completion", async () => {
    await notifyUserOfPayoutOutcome({
      withdrawal,
      targetStatus: WITHDRAWAL_STATUS.COMPLETED,
      normalized: { utr: "UTR-123" },
    });

    expect(sendFcmNotifications).toHaveBeenCalledWith(
      user.fcmTokens,
      expect.any(String),
      expect.stringContaining("₹500"),
    );
    expect(sendTemplateEmail).toHaveBeenCalledWith(
      user.email,
      PAYOUT_EMAIL_TEMPLATE.WITHDRAWAL_SUCCESS,
      PAYOUT_EMAIL_SUBJECT.WITHDRAWAL_SUCCESS,
      expect.objectContaining({
        userName: user.name,
        amount: "500.00",
        withdrawalId: withdrawal._id,
        utr: "UTR-123",
      }),
    );
  });

  test("sends failure reason through FCM and the failure email template", async () => {
    await notifyUserOfPayoutOutcome({
      withdrawal,
      targetStatus: WITHDRAWAL_STATUS.FAILED,
      normalized: { failureReason: "Invalid bank account" },
    });

    expect(sendFcmNotifications).toHaveBeenCalledWith(
      user.fcmTokens,
      expect.any(String),
      expect.stringContaining("Invalid bank account"),
    );
    expect(sendTemplateEmail).toHaveBeenCalledWith(
      user.email,
      PAYOUT_EMAIL_TEMPLATE.WITHDRAWAL_FAILED,
      PAYOUT_EMAIL_SUBJECT.WITHDRAWAL_FAILED,
      expect.objectContaining({
        failureReason: "Invalid bank account",
      }),
    );
  });

  test("retries failed FCM recipients once without retrying successful recipients", async () => {
    jest.useFakeTimers();
    sendFcmNotifications
      .mockResolvedValueOnce({ success: ["good-token"], errors: ["bad-token"] })
      .mockResolvedValueOnce({ success: ["bad-token"], errors: [] });

    await notifyUserOfPayoutOutcome({
      withdrawal,
      targetStatus: WITHDRAWAL_STATUS.COMPLETED,
      normalized: {},
    });
    await jest.advanceTimersByTimeAsync(
      PAYOUT_CONFIG.PAYOUT_NOTIFICATION_RETRY_DELAY_MS,
    );

    expect(sendFcmNotifications).toHaveBeenNthCalledWith(
      1,
      user.fcmTokens,
      expect.any(String),
      expect.stringContaining("₹500"),
    );
    expect(sendFcmNotifications).toHaveBeenNthCalledWith(
      2,
      ["bad-token"],
      expect.any(String),
      expect.stringContaining("₹500"),
    );
  });

  test("does not send email when email is unavailable or for nonterminal state", async () => {
    await notifyUserOfPayoutOutcome({
      withdrawal,
      targetStatus: WITHDRAWAL_STATUS.PROCESSING,
      normalized: {},
    });

    expect(User.findById).not.toHaveBeenCalled();
    expect(sendFcmNotifications).not.toHaveBeenCalled();
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });
});

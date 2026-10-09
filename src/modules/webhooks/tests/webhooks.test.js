const crypto = require("crypto");
const mongoose = require("mongoose");

jest.mock("../../../schemas/withdrawal.schema", () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../../schemas/user.schema", () => ({
  updateOne: jest.fn(),
  findById: jest.fn(),
}));
jest.mock("../../../functions/fcm", () => ({
  sendFcmNotifications: jest.fn().mockResolvedValue({ success: true }),
}));

const Withdrawal = require("../../../schemas/withdrawal.schema");
const User = require("../../../schemas/user.schema");
const { processWebhook, verifySignature } = require("../webhooks.service");

describe("RazorpayX webhook handling", () => {
  const withdrawalId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const secret = "webhook-test-secret";
  const originalNodeEnv = process.env.NODE_ENV;
  const originalWebhookSecret = process.env.RAZORPAYX_WEBHOOK_SECRET;
  let withdrawal;
  let session;

  function signedRequest(event, extra = {}) {
    const body = {
      event,
      payload: {
        payout: {
          entity: {
            id: "pout_test_123",
            reference_id: withdrawalId.toString(),
            ...extra,
          },
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    return { body, rawBody, headers: { "x-razorpay-signature": signature } };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAYX_WEBHOOK_SECRET = secret;
    delete process.env.NODE_ENV;
    withdrawal = {
      _id: withdrawalId,
      userId,
      status: "PROCESSING",
      cashAmount: 200,
      coinAmount: 100,
    };
    session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    Withdrawal.findOne.mockResolvedValue(withdrawal);
    Withdrawal.updateOne.mockImplementation(async (filter, update) => {
      if (filter.status.$nin.includes(withdrawal.status)) {
        return { modifiedCount: 0 };
      }
      withdrawal.status = update.$set.status;
      return { modifiedCount: 1 };
    });
    User.updateOne.mockResolvedValue({ matchedCount: 1 });
    User.findById.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalWebhookSecret === undefined) {
      delete process.env.RAZORPAYX_WEBHOOK_SECRET;
    } else {
      process.env.RAZORPAYX_WEBHOOK_SECRET = originalWebhookSecret;
    }
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  test("verifies signatures against the exact raw body and rejects malformed lengths", () => {
    const rawBody = Buffer.from('{"event":"payout.processed"}');
    const valid = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    expect(verifySignature(rawBody, valid, secret)).toBe(true);
    expect(verifySignature(rawBody, "bad", secret)).toBe(false);
    expect(verifySignature(Buffer.from("different"), valid, secret)).toBe(
      false,
    );
    expect(verifySignature("not-a-buffer", valid, secret)).toBe(false);
  });

  test("fails closed in production when the webhook secret is missing", async () => {
    delete process.env.RAZORPAYX_WEBHOOK_SECRET;
    process.env.NODE_ENV = "production";
    const request = signedRequest("payout.processed");

    await expect(
      processWebhook(request.headers, request.rawBody, request.body),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(Withdrawal.updateOne).not.toHaveBeenCalled();
  });

  test("applies a processed payout once and ignores duplicate and late events", async () => {
    const processed = signedRequest("payout.processed", {
      status: "processed",
      utr: "UTR123",
    });
    const result = await processWebhook(
      processed.headers,
      processed.rawBody,
      processed.body,
    );

    expect(result).toMatchObject({ processed: true, status: "success" });
    expect(withdrawal.status).toBe("COMPLETED");
    expect(User.updateOne).toHaveBeenCalledTimes(1);
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      { $inc: { totalWithdraw: 200 } },
      { session },
    );

    const duplicate = await processWebhook(
      processed.headers,
      processed.rawBody,
      processed.body,
    );
    const lateInitiated = signedRequest("payout.initiated", {
      status: "processing",
    });
    const lateResult = await processWebhook(
      lateInitiated.headers,
      lateInitiated.rawBody,
      lateInitiated.body,
    );

    expect(duplicate.duplicateOrTerminal).toBe(true);
    expect(lateResult.duplicateOrTerminal).toBe(true);
    expect(withdrawal.status).toBe("COMPLETED");
    expect(User.updateOne).toHaveBeenCalledTimes(1);
  });

  test("refunds a failed payout once despite duplicate webhook delivery", async () => {
    const request = signedRequest("payout.failed", {
      status: "failed",
      failure_reason: "Bank declined",
    });
    await processWebhook(request.headers, request.rawBody, request.body);
    await processWebhook(request.headers, request.rawBody, request.body);

    expect(withdrawal.status).toBe("FAILED");
    expect(User.updateOne).toHaveBeenCalledTimes(1);
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      { $inc: { hydaconCoins: 100 } },
      { session },
    );
  });

  test("returns retryable errors when the financial transaction fails", async () => {
    User.updateOne.mockRejectedValueOnce(new Error("database unavailable"));
    const request = signedRequest("payout.processed", { status: "processed" });

    await expect(
      processWebhook(request.headers, request.rawBody, request.body),
    ).rejects.toThrow("database unavailable");
    expect(session.endSession).toHaveBeenCalled();
  });
});

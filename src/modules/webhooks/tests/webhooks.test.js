const crypto = require("crypto");
const mongoose = require("mongoose");

jest.mock("../../../schemas/withdrawal.schema", () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../../schemas/user.schema", () => ({
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
}));
jest.mock("../../../schemas/ledger-entry.schema", () => ({
  create: jest.fn(),
}));
jest.mock("../../../schemas/payout-event.schema", () => ({
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../../../functions/fcm", () => ({
  sendFcmNotifications: jest.fn().mockResolvedValue({ success: true }),
}));

const Withdrawal = require("../../../schemas/withdrawal.schema");
const User = require("../../../schemas/user.schema");
const LedgerEntry = require("../../../schemas/ledger-entry.schema");
const PayoutEvent = require("../../../schemas/payout-event.schema");
const { processWebhook, verifySignature } = require("../webhooks.service");

describe("RazorpayX webhook handling", () => {
  const withdrawalId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const secret = "webhook-test-secret";
  const originalNodeEnv = process.env.NODE_ENV;
  const originalWebhookSecret = process.env.RAZORPAYX_WEBHOOK_SECRET;
  let withdrawal;
  let session;
  let events;

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
    events = new Map();
    session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    Withdrawal.findOne.mockResolvedValue(withdrawal);
    Withdrawal.updateOne.mockImplementation(async (filter, update) => {
      if (filter.status.$nin.includes(withdrawal.status))
        return { modifiedCount: 0 };
      withdrawal.status = update.$set.status;
      return { modifiedCount: 1 };
    });
    User.findOneAndUpdate.mockResolvedValue({
      hydaconCoins: 400,
      totalWithdraw: 0,
    });
    User.findById.mockResolvedValue(null);
    LedgerEntry.create.mockResolvedValue([]);
    PayoutEvent.findOneAndUpdate.mockImplementation(
      async (filter, update, options = {}) => {
        if (options.upsert) {
          const data = update.$setOnInsert;
          let event = events.get(data.dedupeKey);
          if (!event) {
            event = {
              ...data,
              _id: new mongoose.Types.ObjectId(),
              processingAttempts: 0,
            };
            events.set(data.dedupeKey, event);
          }
          return event;
        }
        const event = [...events.values()].find(
          (item) => String(item._id) === String(filter._id),
        );
        if (!event) return null;
        event.processingStatus = update.$set.processingStatus;
        event.processingStartedAt =
          update.$set.processingStartedAt || event.processingStartedAt;
        event.processingAttempts += update.$inc.processingAttempts;
        return event;
      },
    );
    PayoutEvent.updateOne.mockImplementation(
      async (filter, update) => {
        const event = [...events.values()].find(
          (item) => String(item._id) === String(filter._id),
        );
        if (!event) return { modifiedCount: 0 };
        Object.assign(event, update.$set);
        return { modifiedCount: 1 };
      },
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalWebhookSecret === undefined)
      delete process.env.RAZORPAYX_WEBHOOK_SECRET;
    else process.env.RAZORPAYX_WEBHOOK_SECRET = originalWebhookSecret;
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

  test("records a processed payout once and ignores duplicate and late events", async () => {
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
    expect(User.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: userId },
      { $inc: { totalWithdraw: 200 } },
      { new: false, session },
    );
    expect(LedgerEntry.create).toHaveBeenCalledTimes(1);
    const receipt = [...events.values()][0];
    expect(receipt.processingStatus).toBe("PROCESSED");
    expect(receipt.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.safePayload).toMatchObject({
      id: "pout_test_123",
      utr: "UTR123",
    });
    expect(receipt.safePayload.account_number).toBeUndefined();

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
    expect(duplicate.duplicate).toBe(true);
    expect(lateResult.duplicateOrTerminal).toBe(true);
    expect(withdrawal.status).toBe("COMPLETED");
    expect(User.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(LedgerEntry.create).toHaveBeenCalledTimes(1);
  });

  test("records a failed payout refund once despite duplicate webhook delivery", async () => {
    const request = signedRequest("payout.failed", {
      status: "failed",
      failure_reason: "Bank declined",
    });
    await processWebhook(request.headers, request.rawBody, request.body);
    await processWebhook(request.headers, request.rawBody, request.body);
    expect(withdrawal.status).toBe("FAILED");
    expect(User.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: userId },
      { $inc: { hydaconCoins: 100 } },
      { new: false, session },
    );
    expect(LedgerEntry.create).toHaveBeenCalledTimes(1);
  });

  test("rejects provider payout amount mismatches without changing balances", async () => {
    const request = signedRequest("payout.processed", {
      status: "processed",
      amount: 20100,
      currency: "INR",
    });
    const result = await processWebhook(
      request.headers,
      request.rawBody,
      request.body,
    );

    expect(result).toMatchObject({ status: "ignored" });
    expect([...events.values()][0].processingStatus).toBe("IGNORED");
    expect([...events.values()][0].result).toContain("amount-mismatch");
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(LedgerEntry.create).not.toHaveBeenCalled();
  });

  test("rejects a payout ID that conflicts with the withdrawal's recorded payout", async () => {
    withdrawal.providerPayoutId = "pout_expected_123";
    const request = signedRequest("payout.processed", {
      status: "processed",
      amount: 20000,
      currency: "INR",
    });
    const result = await processWebhook(
      request.headers,
      request.rawBody,
      request.body,
    );

    expect(result).toMatchObject({ status: "ignored" });
    expect([...events.values()][0].result).toBe(
      "payout-anomaly:payout ID does not match withdrawal",
    );
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("returns retryable errors when the financial transaction fails", async () => {
    User.findOneAndUpdate.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    const request = signedRequest("payout.processed", { status: "processed" });
    await expect(
      processWebhook(request.headers, request.rawBody, request.body),
    ).rejects.toThrow("database unavailable");
    expect(session.endSession).toHaveBeenCalled();
    expect([...events.values()][0].processingStatus).toBe("FAILED");
  });
});

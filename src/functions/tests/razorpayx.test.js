jest.mock("axios", () => jest.fn());

const originalEnv = {
  keyId: process.env.RAZORPAYX_KEY_ID,
  keySecret: process.env.RAZORPAYX_KEY_SECRET,
  accountNumber: process.env.RAZORPAYX_ACCOUNT_NUMBER,
};

describe("RazorpayX payout request", () => {
  let axios;
  let createRazorpayPayout;
  let payoutIdempotencyKey;

  beforeEach(() => {
    jest.resetModules();
    process.env.RAZORPAYX_KEY_ID = "key_test";
    process.env.RAZORPAYX_KEY_SECRET = "secret_test";
    process.env.RAZORPAYX_ACCOUNT_NUMBER = "account_test";
    axios = require("axios");
    axios.mockResolvedValue({ data: { id: "pout_test_123" } });
    ({ createRazorpayPayout, payoutIdempotencyKey } = require("../razorpayx"));
  });

  afterEach(() => {
    if (originalEnv.keyId === undefined) delete process.env.RAZORPAYX_KEY_ID;
    else process.env.RAZORPAYX_KEY_ID = originalEnv.keyId;
    if (originalEnv.keySecret === undefined)
      delete process.env.RAZORPAYX_KEY_SECRET;
    else process.env.RAZORPAYX_KEY_SECRET = originalEnv.keySecret;
    if (originalEnv.accountNumber === undefined)
      delete process.env.RAZORPAYX_ACCOUNT_NUMBER;
    else process.env.RAZORPAYX_ACCOUNT_NUMBER = originalEnv.accountNumber;
  });

  test("uses the same valid UUID idempotency key for retries of a withdrawal", async () => {
    const referenceId = "507f1f77bcf86cd799439011";
    const firstKey = payoutIdempotencyKey(referenceId);
    const retryKey = payoutIdempotencyKey(referenceId);

    expect(firstKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(retryKey).toBe(firstKey);
    expect(payoutIdempotencyKey("another-withdrawal")).not.toBe(firstKey);

    await createRazorpayPayout("fa_test_123", 20000, referenceId, "Payout");
    await createRazorpayPayout("fa_test_123", 20000, referenceId, "Payout");

    expect(axios).toHaveBeenCalledTimes(2);
    expect(axios.mock.calls[0][0].headers["X-Payout-Idempotency"]).toBe(
      firstKey,
    );
    expect(axios.mock.calls[1][0].headers["X-Payout-Idempotency"]).toBe(
      firstKey,
    );
    expect(axios.mock.calls[0][0].data).toEqual(axios.mock.calls[1][0].data);
  });

  test("marks provider 4xx errors definitive and network errors ambiguous", async () => {
    axios.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { error: { description: "Invalid fund account" } },
      },
      message: "Request failed",
    });
    await expect(
      createRazorpayPayout("fa_test_123", 20000, "withdrawal-1", "Payout"),
    ).rejects.toMatchObject({ providerStatusCode: 400, definitive: true });

    axios.mockRejectedValueOnce(new Error("socket timeout"));
    await expect(
      createRazorpayPayout("fa_test_123", 20000, "withdrawal-2", "Payout"),
    ).rejects.toMatchObject({ definitive: false });
  });
});

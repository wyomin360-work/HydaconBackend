const {
  PAYOUT_PROVIDER,
  CASHFREE_PAYOUT_EVENT,
} = require("../../../constants/payouts");
const { validatePayoutWebhook } = require("../webhooks.middleware");

jest.mock("../../payouts/payout-alerts", () => ({
  reportPayoutAlert: jest.fn(),
}));

describe("Payout webhook middleware", () => {
  const originalClientSecret = process.env.CASHFREE_PAYOUT_CLIENT_SECRET;

  beforeEach(() => {
    process.env.CASHFREE_PAYOUT_CLIENT_SECRET = "cashfree-webhook-test-secret";
  });

  afterAll(() => {
    if (originalClientSecret === undefined) {
      delete process.env.CASHFREE_PAYOUT_CLIENT_SECRET;
      return;
    }
    process.env.CASHFREE_PAYOUT_CLIENT_SECRET = originalClientSecret;
  });

  test("acknowledges Cashfree's unsigned webhook setup validation ping", () => {
    const requestBody = {
      data: {
        current_balance: "8.53",
        fundsource_id: "CASHFREE_1",
      },
      event_time: "2026-10-30T12:00:00Z",
      type: CASHFREE_PAYOUT_EVENT.LOW_BALANCE_ALERT,
    };
    const req = {
      body: requestBody,
      headers: { "x-forwarded-for": "52.66.101.190" },
      params: {},
      path: "/cashfree",
      rawBody: Buffer.from(JSON.stringify(requestBody)),
    };
    const res = {
      json: jest.fn(),
      status: jest.fn(),
    };
    res.status.mockReturnValue(res);
    const next = jest.fn();

    validatePayoutWebhook(PAYOUT_PROVIDER.CASHFREE)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      data: { acknowledged: true },
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("acknowledges unsigned allowlisted webhooks without processing them", () => {
    const requestBody = {
      data: { transfer_id: "transfer-123" },
      type: CASHFREE_PAYOUT_EVENT.TRANSFER_SUCCESS,
    };
    const req = {
      body: requestBody,
      headers: { "x-forwarded-for": "52.66.101.190, 10.0.0.1" },
      params: {},
      path: "/cashfree",
      rawBody: Buffer.from(JSON.stringify(requestBody)),
    };
    const res = {
      json: jest.fn(),
      status: jest.fn(),
    };
    res.status.mockReturnValue(res);
    const next = jest.fn();

    validatePayoutWebhook(PAYOUT_PROVIDER.CASHFREE)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      data: { acknowledged: true },
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects webhook requests from IPs outside Cashfree's allowlist", () => {
    const requestBody = {
      data: {
        current_balance: "8.53",
        fundsource_id: "CASHFREE_1",
      },
      type: CASHFREE_PAYOUT_EVENT.LOW_BALANCE_ALERT,
    };
    const req = {
      body: requestBody,
      headers: { "x-real-ip": "203.0.113.10" },
      params: {},
      path: "/cashfree",
      rawBody: Buffer.from(JSON.stringify(requestBody)),
    };
    const res = {
      json: jest.fn(),
      status: jest.fn(),
    };
    res.status.mockReturnValue(res);
    const next = jest.fn();

    validatePayoutWebhook(PAYOUT_PROVIDER.CASHFREE)(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: "Cashfree webhook source IP is not allowlisted",
      }),
    );
  });
});

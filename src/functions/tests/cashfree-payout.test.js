jest.mock("axios", () => jest.fn());

const {
  CASHFREE_PAYOUT_EVENT,
  CASHFREE_PAYOUT_STATUS,
  CASHFREE_PAYOUT_STATUS_CODE,
  PAYOUT_CONFIG,
  PAYOUT_TRANSFER_MODE,
} = require("../../constants/payouts");
const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");

const originalEnv = {
  clientId: process.env.CASHFREE_PAYOUT_CLIENT_ID,
  clientSecret: process.env.CASHFREE_PAYOUT_CLIENT_SECRET,
  baseUrl: process.env.CASHFREE_PAYOUT_BASE_URL,
};

describe("Cashfree payout provider", () => {
  let axios;
  let provider;
  let mapping;

  beforeEach(() => {
    jest.resetModules();
    process.env.CASHFREE_PAYOUT_CLIENT_ID = "cashfree_test_client";
    process.env.CASHFREE_PAYOUT_CLIENT_SECRET = "cashfree_test_secret";
    process.env.CASHFREE_PAYOUT_BASE_URL =
      PAYOUT_CONFIG.CASHFREE_SANDBOX_BASE_URL;
    axios = require("axios");
    axios.mockReset();
    provider = require("../payouts/providers/cashfree");
    mapping = require("../payouts/providers/cashfree/mapping");
  });

  afterEach(() => {
    if (originalEnv.clientId === undefined)
      delete process.env.CASHFREE_PAYOUT_CLIENT_ID;
    else process.env.CASHFREE_PAYOUT_CLIENT_ID = originalEnv.clientId;
    if (originalEnv.clientSecret === undefined)
      delete process.env.CASHFREE_PAYOUT_CLIENT_SECRET;
    else process.env.CASHFREE_PAYOUT_CLIENT_SECRET = originalEnv.clientSecret;
    if (originalEnv.baseUrl === undefined)
      delete process.env.CASHFREE_PAYOUT_BASE_URL;
    else process.env.CASHFREE_PAYOUT_BASE_URL = originalEnv.baseUrl;
  });

  test("sends transfers to Cashfree sandbox with stable request identity", async () => {
    axios.mockResolvedValueOnce({
      status: 200,
      data: {
        cf_transfer_id: "cf_transfer_123",
        transfer_id: "withdrawal-123",
        status: CASHFREE_PAYOUT_STATUS.SUCCESS,
        status_code: CASHFREE_PAYOUT_STATUS_CODE.COMPLETED,
        transfer_amount: 125.5,
      },
    });

    const result = await provider.initiateTransfer({
      referenceId: "withdrawal-123",
      beneficiaryId: "beneficiary-123",
      amountMinor: 12550,
      mode: PAYOUT_TRANSFER_MODE.IMPS,
      narration: "Hydacon payout",
    });

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "https://sandbox.cashfree.com/payout/transfers",
        headers: expect.objectContaining({
          "x-client-id": "cashfree_test_client",
          "x-client-secret": "cashfree_test_secret",
          "x-api-version": expect.any(String),
          "x-request-id": "transfer-withdrawal-123",
        }),
        data: {
          transfer_id: "withdrawal-123",
          transfer_amount: 125.5,
          transfer_mode: "imps",
          transfer_remarks: "Hydacon payout",
          beneficiary_details: { beneficiary_id: "beneficiary-123" },
        },
      }),
    );
    expect(result).toMatchObject({
      providerTransferId: "cf_transfer_123",
      providerReferenceId: "withdrawal-123",
      targetStatus: WITHDRAWAL_STATUS.COMPLETED,
      amountMinor: 12550,
      httpStatus: 200,
    });
  });

  test("looks up a transfer status by the Hydacon reference on sandbox", async () => {
    axios.mockResolvedValueOnce({
      status: 200,
      data: {
        cf_transfer_id: "cf_transfer_123",
        transfer_id: "withdrawal-123",
        status: CASHFREE_PAYOUT_STATUS.PENDING,
        status_code: CASHFREE_PAYOUT_STATUS.RECEIVED,
        transfer_amount: 125.5,
      },
    });

    const result = await provider.getTransferStatus({
      referenceId: "withdrawal-123",
    });

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: "https://sandbox.cashfree.com/payout/transfers",
        params: { transfer_id: "withdrawal-123" },
      }),
    );
    expect(result).toMatchObject({
      providerReferenceId: "withdrawal-123",
      targetStatus: WITHDRAWAL_STATUS.PROCESSING,
      amountMinor: 12550,
    });
  });

  test("submits a batch transfer to Cashfree sandbox", async () => {
    axios.mockResolvedValueOnce({
      status: 200,
      data: {
        batch_transfer_id: "hydacon_batch_123",
        cf_batch_transfer_id: "cf_batch_123",
        status: "RECEIVED",
      },
    });

    const result = await provider.initiateBatchTransfer({
      batchReferenceId: "hydacon_batch_123",
      transfers: [
        {
          referenceId: "withdrawal_123",
          beneficiaryId: "beneficiary_123",
          amountMinor: 12550,
          mode: PAYOUT_TRANSFER_MODE.IMPS,
          narration: "Hydacon payout",
        },
      ],
    });

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "https://sandbox.cashfree.com/payout/transfers/batch",
        data: {
          batch_transfer_id: "hydacon_batch_123",
          transfers: [
            {
              transfer_id: "withdrawal_123",
              transfer_amount: 125.5,
              transfer_mode: "imps",
              transfer_remarks: "Hydacon payout",
              beneficiary_details: { beneficiary_id: "beneficiary_123" },
            },
          ],
        },
      }),
    );
    expect(result).toMatchObject({
      batchReferenceId: "hydacon_batch_123",
      providerBatchTransferId: "cf_batch_123",
      status: "RECEIVED",
    });
  });

  test("checks batch status by the stable batch reference on sandbox", async () => {
    axios.mockResolvedValueOnce({
      status: 200,
      data: {
        batch_transfer_id: "hydacon_batch_123",
        cf_batch_transfer_id: "cf_batch_123",
        status: "RECEIVED",
        transfers: [
          {
            transfer_id: "withdrawal_123",
            cf_transfer_id: "cf_transfer_123",
            transfer_amount: 125.5,
            status: CASHFREE_PAYOUT_STATUS.SUCCESS,
            status_code: CASHFREE_PAYOUT_STATUS_CODE.COMPLETED,
          },
        ],
      },
    });

    const result = await provider.getBatchTransferStatus({
      batchReferenceId: "hydacon_batch_123",
    });

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: "https://sandbox.cashfree.com/payout/transfers/batch",
        params: { batch_transfer_id: "hydacon_batch_123" },
      }),
    );
    expect(result).toMatchObject({
      batchReferenceId: "hydacon_batch_123",
      providerBatchTransferId: "cf_batch_123",
      status: "RECEIVED",
      transfers: [
        {
          providerReferenceId: "withdrawal_123",
          providerTransferId: "cf_transfer_123",
          targetStatus: WITHDRAWAL_STATUS.COMPLETED,
        },
      ],
    });
  });

  test("treats only a completed success as final success", () => {
    expect(
      mapping.normalizeTransfer({
        status: CASHFREE_PAYOUT_STATUS.SUCCESS,
        status_code: CASHFREE_PAYOUT_STATUS_CODE.COMPLETED,
      }).targetStatus,
    ).toBe(WITHDRAWAL_STATUS.COMPLETED);
    expect(
      mapping.normalizeTransfer({
        status: CASHFREE_PAYOUT_STATUS.SUCCESS,
        status_code: CASHFREE_PAYOUT_STATUS.PENDING,
      }).targetStatus,
    ).toBeNull();
    expect(
      mapping.normalizeTransfer({
        status: CASHFREE_PAYOUT_STATUS.SUCCESS,
        status_code: CASHFREE_PAYOUT_STATUS_CODE.SENT_TO_BENEFICIARY,
      }).targetStatus,
    ).toBe(WITHDRAWAL_STATUS.PROCESSING);
    expect(
      mapping.normalizeWebhook({
        type: CASHFREE_PAYOUT_EVENT.TRANSFER_SUCCESS,
        data: { status: CASHFREE_PAYOUT_STATUS.PENDING },
      }).targetStatus,
    ).toBe(WITHDRAWAL_STATUS.PROCESSING);
  });

  test("maps manually rejected transfers to failed", () => {
    expect(
      mapping.normalizeTransfer({
        transfer_id: "withdrawal-manually-rejected",
        status: CASHFREE_PAYOUT_STATUS.MANUALLY_REJECTED,
      }).targetStatus,
    ).toBe(WITHDRAWAL_STATUS.FAILED);
  });

  test("requires an explicit secure Cashfree base URL", () => {
    const api = require("../payouts/providers/cashfree/api");
    expect(() => api.validateConfig()).not.toThrow();
    delete process.env.CASHFREE_PAYOUT_BASE_URL;
    expect(() => api.validateConfig()).toThrow(/not configured/);
    process.env.CASHFREE_PAYOUT_BASE_URL = "http://cashfree.internal";
    expect(() => api.validateConfig()).toThrow(/HTTPS URL/);
  });

  test("uses the configured Cashfree base URL verbatim after trimming its slash", () => {
    process.env.CASHFREE_PAYOUT_BASE_URL = "https://cashfree.example/payout/";
    const api = require("../payouts/providers/cashfree/api");
    expect(api.getBaseUrl()).toBe("https://cashfree.example/payout");
  });

  test("verifies webhook signatures against the exact timestamp and raw body", () => {
    const crypto = require("crypto");
    const timestamp = "1730000000";
    const rawBody = Buffer.from('{"type":"TRANSFER_SUCCESS"}');
    const signature = crypto
      .createHmac("sha256", "cashfree_test_secret")
      .update(`${timestamp}${rawBody.toString("utf8")}`)
      .digest("base64");

    expect(() =>
      provider.verifyWebhook(
        {
          "x-real-ip": "52.66.101.190",
          "x-webhook-timestamp": timestamp,
          "x-webhook-signature": signature,
        },
        rawBody,
      ),
    ).not.toThrow();

    expect(() =>
      provider.verifyWebhook(
        {
          "x-real-ip": "52.66.101.190",
          "x-webhook-timestamp": timestamp,
          "x-webhook-signature": `${signature}invalid`,
        },
        rawBody,
      ),
    ).toThrow("Invalid webhook signature");
  });

  test("rejects missing provider credentials", () => {
    delete process.env.CASHFREE_PAYOUT_CLIENT_ID;
    expect(() => provider.validateConfig()).toThrow(/credentials/i);
  });

  test("classifies missing credentials as a definitive pre-request failure", async () => {
    delete process.env.CASHFREE_PAYOUT_CLIENT_ID;

    await expect(
      provider.initiateTransfer({
        referenceId: "withdrawal-123",
        beneficiaryId: "beneficiary-123",
        amountMinor: 12550,
        mode: PAYOUT_TRANSFER_MODE.IMPS,
        narration: "Hydacon payout",
      }),
    ).rejects.toMatchObject({ definitive: true, ambiguous: false });

    expect(axios).not.toHaveBeenCalled();
  });
});

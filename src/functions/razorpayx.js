const axios = require("axios");
const crypto = require("crypto");
const logger = require("../config/pino.config");

const KEY_ID = process.env.RAZORPAYX_KEY_ID;
const KEY_SECRET = process.env.RAZORPAYX_KEY_SECRET;
const ACCOUNT_NUMBER = process.env.RAZORPAYX_ACCOUNT_NUMBER;
const REQUEST_TIMEOUT_MS = Number(process.env.RAZORPAYX_TIMEOUT_MS || 15000);

function safeProviderMessage(error, fallback) {
  const message =
    error?.response?.data?.error?.description || error?.message || fallback;
  return String(message)
    .replace(/\d{6,}/g, "[redacted]")
    .slice(0, 500);
}

// Use a deterministic UUID so a retry after a timeout carries the same key.
// Deriving it from the immutable withdrawal reference makes retries safe even
// when the original request timed out after Razorpay accepted it.
function payoutIdempotencyKey(referenceId) {
  const bytes = crypto
    .createHash("sha256")
    .update(String(referenceId))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function verifyWebhookSignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || !signature || !secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const received = Buffer.from(String(signature), "ascii");
  const expectedBuffer = Buffer.from(expected, "ascii");
  return (
    received.length === expectedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, received)
  );
}

function verifyPayoutWebhook(headers = {}, rawBody) {
  const secret = process.env.RAZORPAYX_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      const error = new Error("Payout webhook secret is not configured");
      error.statusCode = 401;
      throw error;
    }
    logger.warn(
      "Payout webhook signature verification bypassed outside production",
    );
    return;
  }
  if (
    !verifyWebhookSignature(rawBody, headers["x-razorpay-signature"], secret)
  ) {
    const error = new Error("Invalid webhook signature");
    error.statusCode = 401;
    throw error;
  }
}

function getPayoutWebhookDeliveryId(headers = {}) {
  return headers["x-razorpay-event-id"] || null;
}

const getAuthHeaders = () => {
  if (!KEY_ID || !KEY_SECRET) {
    const error = new Error(
      "RazorpayX key ID or key secret is not configured in environment variables",
    );
    error.definitive = true;
    throw error;
  }
  const token = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
  return {
    Authorization: `Basic ${token}`,
    "Content-Type": "application/json",
  };
};

/**
 * Creates a beneficiary contact on RazorpayX.
 */
async function createRazorpayContact(user) {
  try {
    const response = await axios({
      method: "POST",
      url: "https://api.razorpay.com/v1/contacts",
      headers: getAuthHeaders(),
      timeout: REQUEST_TIMEOUT_MS,
      data: {
        name: user.name || "Hydacon User",
        email: user.email || undefined,
        contact: user.phone || undefined,
        type: "customer",
        reference_id: user._id.toString(),
      },
    });
    return response.data;
  } catch (error) {
    logger.error("RazorpayX contact creation failed", {
      providerStatusCode: error?.response?.status || null,
      providerErrorCode: error?.response?.data?.error?.code || null,
    });
    throw new Error(
      safeProviderMessage(error, "Failed to create RazorpayX contact"),
    );
  }
}

/**
 * Creates a fund account linked to a contact on RazorpayX.
 */
async function createRazorpayFundAccount(contactId, bankDetails) {
  try {
    const response = await axios({
      method: "POST",
      url: "https://api.razorpay.com/v1/fund_accounts",
      headers: getAuthHeaders(),
      timeout: REQUEST_TIMEOUT_MS,
      data: {
        contact_id: contactId,
        account_type: "bank_account",
        bank_account: {
          name: bankDetails.accountHolderName,
          ifsc: bankDetails.ifscCode,
          account_number: bankDetails.accountNumber,
        },
      },
    });
    return response.data;
  } catch (error) {
    logger.error("RazorpayX fund account creation failed", {
      providerStatusCode: error?.response?.status || null,
      providerErrorCode: error?.response?.data?.error?.code || null,
    });
    throw new Error(
      safeProviderMessage(error, "Failed to create RazorpayX fund account"),
    );
  }
}

/**
 * Creates a payout on RazorpayX.
 */
async function createRazorpayPayout(
  fundAccountId,
  amountInPaise,
  referenceId,
  narration,
) {
  if (!ACCOUNT_NUMBER) {
    const error = new Error(
      "RazorpayX account number is not configured in environment variables",
    );
    error.definitive = true;
    throw error;
  }
  try {
    const body = {
      account_number: ACCOUNT_NUMBER,
      fund_account_id: fundAccountId,
      amount: amountInPaise,
      currency: "INR",
      mode: "IMPS",
      purpose: "payout",
      queue_if_low_balance: true,
      reference_id: referenceId,
      narration: narration || "Hydacon Payout",
    };
    const response = await axios({
      method: "POST",
      url: "https://api.razorpay.com/v1/payouts",
      headers: {
        ...getAuthHeaders(),
        "X-Payout-Idempotency": payoutIdempotencyKey(referenceId),
      },
      timeout: REQUEST_TIMEOUT_MS,
      data: body,
    });
    return { ...response.data, _httpStatus: response.status };
  } catch (error) {
    const payoutError = new Error(
      safeProviderMessage(error, "Failed to create RazorpayX payout"),
    );
    payoutError.providerStatusCode = error?.response?.status;
    payoutError.providerErrorCode = error?.response?.data?.error?.code || null;
    payoutError.definitive =
      error?.definitive ||
      (error?.response?.status >= 400 && error.response.status < 500);
    logger.error("RazorpayX payout API call failed", {
      providerStatusCode: payoutError.providerStatusCode || null,
      providerErrorCode: payoutError.providerErrorCode,
      definitive: payoutError.definitive,
    });
    throw payoutError;
  }
}

/** Fetch a payout snapshot for low-frequency reconciliation of stuck withdrawals. */
async function fetchRazorpayPayoutByReference(referenceId) {
  if (!ACCOUNT_NUMBER) {
    const error = new Error("RazorpayX account number is not configured");
    error.definitive = true;
    throw error;
  }
  try {
    const response = await axios({
      method: "GET",
      url: "https://api.razorpay.com/v1/payouts",
      headers: getAuthHeaders(),
      timeout: REQUEST_TIMEOUT_MS,
      params: {
        account_number: ACCOUNT_NUMBER,
        reference_id: referenceId,
        count: 1,
      },
    });
    const payout = response.data?.items?.find(
      (item) => item.reference_id === referenceId,
    );
    return payout ? { ...payout, _httpStatus: response.status } : null;
  } catch (error) {
    logger.error("RazorpayX payout reconciliation request failed", {
      providerStatusCode: error?.response?.status || null,
      providerErrorCode: error?.response?.data?.error?.code || null,
    });
    const reconciliationError = new Error(
      safeProviderMessage(error, "RazorpayX payout reconciliation failed"),
    );
    reconciliationError.providerStatusCode = error?.response?.status;
    reconciliationError.definitive = error?.definitive || false;
    throw reconciliationError;
  }
}

module.exports = {
  createPayoutContact: createRazorpayContact,
  createPayoutFundAccount: createRazorpayFundAccount,
  createPayout: createRazorpayPayout,
  createIdempotencyKey: payoutIdempotencyKey,
  fetchPayoutByReference: fetchRazorpayPayoutByReference,
  verifyPayoutWebhook,
  getPayoutWebhookDeliveryId,
  createRazorpayContact,
  createRazorpayFundAccount,
  createRazorpayPayout,
  payoutIdempotencyKey,
  fetchRazorpayPayoutByReference,
};

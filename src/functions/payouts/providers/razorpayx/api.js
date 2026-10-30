const axios = require("axios");
const crypto = require("crypto");
const logger = require("../../../../config/pino.config");
const {
  PAYOUT_CURRENCY,
  PAYOUT_MESSAGE,
  PAYOUT_TRANSFER_MODE,
} = require("../../../../constants/payouts");

const REQUEST_TIMEOUT_MS = Number(process.env.RAZORPAYX_TIMEOUT_MS || 15000);

function safeProviderMessage(error, fallback) {
  const message =
    error?.response?.data?.error?.description || error?.message || fallback;
  return String(message)
    .replace(/\d{6,}/g, "[redacted]")
    .slice(0, 500);
}

function createIdempotencyKey(referenceId) {
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

function getAuthHeaders() {
  const keyId = process.env.RAZORPAYX_KEY_ID;
  const keySecret = process.env.RAZORPAYX_KEY_SECRET;
  if (!keyId || !keySecret) {
    const error = new Error(
      PAYOUT_MESSAGE.PROVIDER_CREDENTIALS_MISSING("RazorpayX"),
    );
    error.definitive = true;
    throw error;
  }
  return {
    Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

function validateConfig() {
  if (
    !process.env.RAZORPAYX_KEY_ID ||
    !process.env.RAZORPAYX_KEY_SECRET ||
    !process.env.RAZORPAYX_ACCOUNT_NUMBER
  ) {
    throw new Error(PAYOUT_MESSAGE.PROVIDER_CREDENTIALS_MISSING("RazorpayX"));
  }
}

function wrapError(error, fallback) {
  const wrapped = new Error(safeProviderMessage(error, fallback));
  wrapped.providerStatusCode = error?.response?.status || null;
  wrapped.providerErrorCode = error?.response?.data?.error?.code || null;
  wrapped.definitive = Boolean(
    error?.definitive ||
    (wrapped.providerStatusCode >= 400 && wrapped.providerStatusCode < 500),
  );
  return wrapped;
}

async function createContact(user) {
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
        reference_id: String(user._id),
      },
    });
    return response.data;
  } catch (error) {
    logger.error("RazorpayX contact creation failed", {
      providerStatusCode: error?.response?.status || null,
      providerErrorCode: error?.response?.data?.error?.code || null,
    });
    throw wrapError(error, "Failed to create RazorpayX contact");
  }
}

async function createFundAccount(contactId, bankDetails) {
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
    throw wrapError(error, "Failed to create RazorpayX fund account");
  }
}

async function createTransfer({
  beneficiaryId,
  amountMinor,
  referenceId,
  narration,
  idempotencyKey,
}) {
  const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER;
  if (!accountNumber) {
    const error = new Error(PAYOUT_MESSAGE.PROVIDER_ACCOUNT_MISSING);
    error.definitive = true;
    throw error;
  }
  try {
    const response = await axios({
      method: "POST",
      url: "https://api.razorpay.com/v1/payouts",
      headers: {
        ...getAuthHeaders(),
        "X-Payout-Idempotency":
          idempotencyKey || createIdempotencyKey(referenceId),
      },
      timeout: REQUEST_TIMEOUT_MS,
      data: {
        account_number: accountNumber,
        fund_account_id: beneficiaryId,
        amount: amountMinor,
        currency: PAYOUT_CURRENCY.INR,
        mode: PAYOUT_TRANSFER_MODE.IMPS,
        purpose: "payout",
        queue_if_low_balance: true,
        reference_id: referenceId,
        narration: narration || "Hydacon Payout",
      },
    });
    return { ...response.data, _httpStatus: response.status };
  } catch (error) {
    logger.error("RazorpayX payout API call failed", {
      providerStatusCode: error?.response?.status || null,
      providerErrorCode: error?.response?.data?.error?.code || null,
    });
    throw wrapError(error, "Failed to create RazorpayX payout");
  }
}

async function fetchTransferByReference(referenceId) {
  const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER;
  if (!accountNumber) {
    const error = new Error(PAYOUT_MESSAGE.PROVIDER_ACCOUNT_MISSING);
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
        account_number: accountNumber,
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
    throw wrapError(error, "RazorpayX payout reconciliation failed");
  }
}

module.exports = {
  validateConfig,
  createContact,
  createFundAccount,
  createTransfer,
  fetchTransferByReference,
  createIdempotencyKey,
};

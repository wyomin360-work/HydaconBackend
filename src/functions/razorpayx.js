const axios = require("axios");
const crypto = require("crypto");

const KEY_ID = process.env.RAZORPAYX_KEY_ID;
const KEY_SECRET = process.env.RAZORPAYX_KEY_SECRET;
const ACCOUNT_NUMBER = process.env.RAZORPAYX_ACCOUNT_NUMBER;

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
    console.error(
      "Error creating RazorpayX contact:",
      error?.response?.data || error.message,
    );
    throw new Error(
      error?.response?.data?.error?.description ||
        "Failed to create RazorpayX contact",
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
    console.error(
      "Error creating RazorpayX fund account:",
      error?.response?.data || error.message,
    );
    throw new Error(
      error?.response?.data?.error?.description ||
        "Failed to create RazorpayX fund account",
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
      data: body,
    });
    return response.data;
  } catch (error) {
    console.error(
      "Error creating RazorpayX payout:",
      error?.response?.data || error.message,
    );
    const payoutError = new Error(
      error?.response?.data?.error?.description ||
        "Failed to create RazorpayX payout",
    );
    payoutError.providerStatusCode = error?.response?.status;
    payoutError.definitive =
      error?.definitive ||
      (error?.response?.status >= 400 && error.response.status < 500);
    throw payoutError;
  }
}

module.exports = {
  createRazorpayContact,
  createRazorpayFundAccount,
  createRazorpayPayout,
  payoutIdempotencyKey,
};

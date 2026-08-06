const axios = require("axios");
const crypto = require("crypto");

const KEY_ID = process.env.RAZORPAYX_KEY_ID;
const KEY_SECRET = process.env.RAZORPAYX_KEY_SECRET;
const ACCOUNT_NUMBER = process.env.RAZORPAYX_ACCOUNT_NUMBER;

const getAuthHeaders = () => {
  if (!KEY_ID || !KEY_SECRET) {
    throw new Error("RazorpayX key ID or key secret is not configured in environment variables");
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
    console.error("Error creating RazorpayX contact:", error?.response?.data || error.message);
    throw new Error(error?.response?.data?.error?.description || "Failed to create RazorpayX contact");
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
    console.error("Error creating RazorpayX fund account:", error?.response?.data || error.message);
    throw new Error(error?.response?.data?.error?.description || "Failed to create RazorpayX fund account");
  }
}

/**
 * Creates a payout on RazorpayX.
 */
async function createRazorpayPayout(fundAccountId, amountInPaise, referenceId, narration) {
  if (!ACCOUNT_NUMBER) {
    throw new Error("RazorpayX account number is not configured in environment variables");
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
    const bodyHash = crypto.createHash("md5").update(JSON.stringify(body)).digest("hex").substring(0, 8);
    const idempotencyKey = `${referenceId}_${bodyHash}`;

    const response = await axios({
      method: "POST",
      url: "https://api.razorpay.com/v1/payouts",
      headers: {
        ...getAuthHeaders(),
        "X-Payout-Idempotency": idempotencyKey,
      },
      data: body,
    });
    return response.data;
  } catch (error) {
    console.error("Error creating RazorpayX payout:", error?.response?.data || error.message);
    throw new Error(error?.response?.data?.error?.description || "Failed to create RazorpayX payout");
  }
}

module.exports = {
  createRazorpayContact,
  createRazorpayFundAccount,
  createRazorpayPayout,
};

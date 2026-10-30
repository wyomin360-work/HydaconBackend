const crypto = require("crypto");
const {
  CASHFREE_PAYOUT_WEBHOOK_IPS,
  PAYOUT_MESSAGE,
} = require("../../../../constants/payouts");

function signatureError(message) {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

function isWebhookSourceAllowed(headers = {}) {
  const sourceIp =
    headers["x-real-ip"] || headers["x-forwarded-for"]?.split(",")[0];
  if (typeof sourceIp !== "string") return false;

  const normalizedIp = sourceIp.trim().replace(/^::ffff:/i, "");
  return CASHFREE_PAYOUT_WEBHOOK_IPS.includes(normalizedIp);
}

function isWebhookSetupValidation(headers = {}) {
  if (
    !isWebhookSourceAllowed(headers) ||
    headers["x-webhook-signature"] != null ||
    headers["x-webhook-timestamp"] != null
  ) {
    return false;
  }
  return true;
}

function verifyWebhook(headers = {}, rawBody) {
  if (!isWebhookSourceAllowed(headers)) {
    throw signatureError(PAYOUT_MESSAGE.CASHFREE_WEBHOOK_IP_REJECTED);
  }

  const signature = headers["x-webhook-signature"];
  const timestamp = headers["x-webhook-timestamp"];
  const secret = process.env.CASHFREE_PAYOUT_CLIENT_SECRET;
  if (!secret)
    throw signatureError(PAYOUT_MESSAGE.CASHFREE_WEBHOOK_SECRET_MISSING);
  if (!signature || !timestamp || !Buffer.isBuffer(rawBody))
    throw signatureError(PAYOUT_MESSAGE.SIGNATURE_HEADERS_MISSING);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}${rawBody.toString("utf8")}`)
    .digest("base64");
  const expectedBytes = Buffer.from(expected, "ascii");
  const signatureBytes = Buffer.from(String(signature), "ascii");
  if (
    expectedBytes.length !== signatureBytes.length ||
    !crypto.timingSafeEqual(expectedBytes, signatureBytes)
  ) {
    throw signatureError(PAYOUT_MESSAGE.INVALID_SIGNATURE);
  }
}

module.exports = {
  verifyWebhook,
  isWebhookSetupValidation,
  isWebhookSourceAllowed,
};

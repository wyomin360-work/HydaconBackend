const crypto = require("crypto");
const { PAYOUT_MESSAGE } = require("../../../../constants/payouts");

function signatureError(message) {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

function verifyWebhook(headers = {}, rawBody) {
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

module.exports = { verifyWebhook };

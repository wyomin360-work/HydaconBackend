const crypto = require("crypto");

function signatureError(message) {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

function verifyWebhook(headers = {}, rawBody) {
  const signature = headers["x-webhook-signature"];
  const timestamp = headers["x-webhook-timestamp"];
  const secret = process.env.CASHFREE_PAYOUT_CLIENT_SECRET;
  if (!secret || !signature || !timestamp || !Buffer.isBuffer(rawBody)) {
    if (process.env.NODE_ENV !== "production" && !secret) return;
    throw signatureError("Cashfree webhook signature headers are missing");
  }
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
    throw signatureError("Invalid Cashfree webhook signature");
  }
}

module.exports = { verifyWebhook };

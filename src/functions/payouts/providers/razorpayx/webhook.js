const crypto = require("crypto");
const logger = require("../../../../config/pino.config");

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

function verifyWebhook(headers = {}, rawBody) {
  const secret = process.env.RAZORPAYX_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      const error = new Error("RazorpayX webhook secret is not configured");
      error.statusCode = 401;
      throw error;
    }
    logger.warn(
      "RazorpayX webhook signature verification bypassed outside production",
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

module.exports = { verifyWebhook, verifyWebhookSignature };

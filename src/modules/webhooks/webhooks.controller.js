const service = require("./webhooks.service");
const { sendResponse } = require("../../utils/responseHandlers");
const logger = require("../../config/pino.config");

exports.handlePayoutWebhook = async (req, res, next) => {
  try {
    const headers = req.headers;
    const rawBody = req.rawBody;
    const body = req.body;

    const result = await service.processWebhook(headers, rawBody, body);
    return sendResponse(res, {
      message: "Webhook processed successfully",
      ...result,
    });
  } catch (error) {
    const statusCode =
      error.statusCode || (error instanceof SyntaxError ? 400 : 500);
    logger.error("Payout provider webhook request failed", {
      statusCode,
      error: String(error.message)
        .replace(/\d{6,}/g, "[redacted]")
        .slice(0, 500),
    });
    return res.status(statusCode).json({
      status: "Fail",
      message:
        statusCode >= 500
          ? "Webhook processing failed; the provider should retry delivery"
          : error.message || "Failed to process webhook",
    });
  }
};

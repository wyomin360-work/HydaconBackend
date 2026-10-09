const service = require("./webhooks.service");
const { sendResponse } = require("../../utils/responseHandlers");

exports.handleRazorpayXWebhook = async (req, res, next) => {
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
    console.error("Webhook processing error:", error);
    const statusCode =
      error.statusCode || (error instanceof SyntaxError ? 400 : 500);
    return res.status(statusCode).json({
      status: "Fail",
      message: error.message || "Failed to process webhook",
    });
  }
};

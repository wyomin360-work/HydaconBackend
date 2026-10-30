const { PAYOUT_MESSAGE } = require("../../constants/payouts");
const { sendResponse } = require("../../utils/responseHandlers");
const service = require("./webhooks.service");

exports.handlePayoutWebhook = async (req, res) => {
  const result = await service.processWebhook(
    req.headers,
    req.rawBody,
    req.body,
    {
      provider: req.params.provider,
    },
  );
  return sendResponse(res, {
    message: PAYOUT_MESSAGE.WEBHOOK_SUCCESS,
    ...result,
  });
};

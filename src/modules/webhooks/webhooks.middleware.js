const {
  PAYOUT_PROVIDER,
  PAYOUT_HTTP_STATUS,
} = require("../../constants/payouts");
const { getProvider, currentProviderName } = require("../../functions/payouts");
const AppError = require("../../utils/appError");
const validateRequest = require("../../middlewares/validator");
const {
  cashfreePayoutWebhookRequestType,
  razorpayxPayoutWebhookRequestType,
} = require("../../validations/payouts.validations");

const requestSchemas = {
  [PAYOUT_PROVIDER.CASHFREE]: cashfreePayoutWebhookRequestType,
  [PAYOUT_PROVIDER.RAZORPAYX]: razorpayxPayoutWebhookRequestType,
};
const requestValidators = Object.fromEntries(
  Object.entries(requestSchemas).map(([provider, schema]) => [
    provider,
    validateRequest(schema),
  ]),
);

function validatePayoutWebhook(providerName) {
  return (req, res, next) => {
    const resolvedProvider = providerName || currentProviderName();
    req.params.provider = resolvedProvider;
    try {
      getProvider(resolvedProvider).verifyWebhook(req.headers, req.rawBody);
    } catch (error) {
      return next(
        new AppError(
          error.message,
          error.statusCode || PAYOUT_HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ),
      );
    }
    return requestValidators[resolvedProvider](req, res, next);
  };
}

module.exports = { validatePayoutWebhook };

const {
  PAYOUT_PROVIDER,
  PAYOUT_HTTP_STATUS,
  PAYOUT_ALERT_TYPE,
  PAYOUT_ALERT_SEVERITY,
  PAYOUT_MESSAGE,
} = require("../../constants/payouts");
const { getProvider, currentProviderName } = require("../../functions/payouts");
const AppError = require("../../utils/appError");
const validateRequest = require("../../middlewares/validator");
const { reportPayoutAlert } = require("../payouts/payout-alerts");
const logger = require("../../config/pino.config");
const { sendResponse } = require("../../utils/responseHandlers");
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
      const provider = getProvider(resolvedProvider);
      if (provider.isWebhookSetupValidation?.(req.headers, req.rawBody)) {
        logger.info("Cashfree webhook setup validation ping acknowledged", {
          endpoint: req.path,
        });
        return sendResponse(res, { acknowledged: true });
      }
      provider.verifyWebhook(req.headers, req.rawBody);
    } catch (error) {
      reportPayoutAlert({
        type: PAYOUT_ALERT_TYPE.WEBHOOK_SIGNATURE_FAILURE,
        severity: PAYOUT_ALERT_SEVERITY.CRITICAL,
        summary: PAYOUT_MESSAGE.WEBHOOK_SIGNATURE_REJECTED,
        error,
        provider: resolvedProvider,
        details: {
          endpoint: req.path,
          reason: error.message,
        },
      });
      logger.warn(PAYOUT_MESSAGE.WEBHOOK_SIGNATURE_REJECTED, {
        provider: resolvedProvider,
        endpoint: req.path,
      });
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

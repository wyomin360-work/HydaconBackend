const express = require("express");
const paths = require("./webhooks.paths");
const controller = require("./webhooks.controller");
const { validatePayoutWebhook } = require("./webhooks.middleware");
const { handleError } = require("../../utils/heplers");
const { PAYOUT_PROVIDER } = require("../../constants/payouts");

const router = express.Router();

router.post(
  paths.DEFAULT_PAYOUT,
  handleError(validatePayoutWebhook()),
  handleError(controller.handlePayoutWebhook),
);
router.post(
  paths.RAZORPAYX_PAYOUT,
  handleError(validatePayoutWebhook(PAYOUT_PROVIDER.RAZORPAYX)),
  handleError(controller.handlePayoutWebhook),
);
router.post(
  paths.CASHFREE_PAYOUT,
  handleError(validatePayoutWebhook(PAYOUT_PROVIDER.CASHFREE)),
  handleError(controller.handlePayoutWebhook),
);

module.exports = router;

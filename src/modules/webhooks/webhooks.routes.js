const express = require("express");
const controller = require("./webhooks.controller");
const { handleError } = require("../../utils/heplers");

const router = express.Router();

router.post("/payout", handleError(controller.handlePayoutWebhook));
router.post("/razorpayx", handleError(controller.handlePayoutWebhook));

module.exports = router;

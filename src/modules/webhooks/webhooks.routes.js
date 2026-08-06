const express = require("express");
const controller = require("./webhooks.controller");
const { handleError } = require("../../utils/heplers");

const router = express.Router();

router.post("/razorpayx", handleError(controller.handleRazorpayXWebhook));

module.exports = router;

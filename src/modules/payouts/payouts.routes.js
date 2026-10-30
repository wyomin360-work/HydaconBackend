const express = require("express");
const paths = require("./payouts.path");
const controller = require("./payouts.controller");
const verification = require("../../middlewares/jwtVerification");
const validateRequest = require("../../middlewares/validator");
const {
  listPayoutsRequestType,
} = require("../../validations/payouts.validations");
const { handleError } = require("../../utils/heplers");

const router = express.Router();

router.post(
  paths.adminList,
  verification.verifyAdmin,
  validateRequest(listPayoutsRequestType),
  handleError(controller.listPayouts),
);

router.get(
  paths.adminSummary,
  verification.verifyAdmin,
  handleError(controller.getPayoutSummary),
);

router.get(
  paths.adminDetails,
  verification.verifyAdmin,
  handleError(controller.getPayoutDetails),
);

module.exports = router;

const express = require("express");
const paths = require("./payouts.path");
const controller = require("./payouts.controller");
const verification = require("../../middlewares/jwtVerification");
const validateRequest = require("../../middlewares/validator");
const {
  listPayoutsRequestType,
  completeManualPayoutRequestType,
  resolveManualReviewPayoutRequestType,
  failManualReviewPayoutRequestType,
  cancelManualPayoutRequestType,
  convertManualPayoutRequestType,
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

router.post(
  paths.adminCompleteManual,
  verification.verifyAdmin,
  validateRequest(completeManualPayoutRequestType),
  handleError(controller.completeManualPayout),
);

router.post(
  paths.adminResolveManualReview,
  verification.verifyAdmin,
  validateRequest(resolveManualReviewPayoutRequestType),
  handleError(controller.resolveManualReviewPayout),
);

router.post(
  paths.adminFailManualReview,
  verification.verifyAdmin,
  validateRequest(failManualReviewPayoutRequestType),
  handleError(controller.failManualReviewPayout),
);

router.post(
  paths.adminCancelManual,
  verification.verifyAdmin,
  validateRequest(cancelManualPayoutRequestType),
  handleError(controller.cancelManualPayout),
);

router.post(
  paths.adminConvertToProvider,
  verification.verifyAdmin,
  validateRequest(convertManualPayoutRequestType),
  handleError(controller.convertManualPayoutToProvider),
);

router.get(
  paths.adminStatement,
  verification.verifyAdmin,
  handleError(controller.downloadPayoutStatement),
);

router.get(
  paths.adminDetails,
  verification.verifyAdmin,
  handleError(controller.getPayoutDetails),
);

module.exports = router;

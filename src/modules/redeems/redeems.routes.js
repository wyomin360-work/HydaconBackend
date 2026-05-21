const express = require("express");
const redeemsPath = require("./redeems.path");
const redeemsController = require("./redeems.controller");
const { handleError } = require("../../utils/heplers");
const verification = require("../../middlewares/jwtVerification");
const { requireVerifiedKyc } = require("../../middlewares/kycVerification");
const validateRequest = require("../../middlewares/validator");
const {
  listRedeemsRequestType,
  createRedeemRequestType,
  redeemIdRequestType,
} = require("../../validations/redeems.validations");

const router = express.Router();

router.post(
  redeemsPath.list,
  verification.verifyAdminOrUser,
  validateRequest(listRedeemsRequestType),
  handleError(redeemsController.listRedeems),
);

router.get(
  redeemsPath.details,
  verification.verifyAdmin,
  handleError(redeemsController.redeemDetails),
);

router.post(
  redeemsPath.create,
  verification.verifyUser,
  requireVerifiedKyc,
  validateRequest(createRedeemRequestType),
  handleError(redeemsController.createRedeem),
);

router.delete(
  redeemsPath.delete,
  verification.verifyAdmin,
  handleError(redeemsController.deleteRedeem),
);

module.exports = router;

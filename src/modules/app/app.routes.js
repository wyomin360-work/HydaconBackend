const express = require("express");
const appPaths = require("./app.paths");
const verification = require("../../middlewares/jwtVerification");
const controller = require("./app.controller");
const { handleError } = require("../../utils/heplers");
const validateRequest = require("../../middlewares/validator");
const {
  appConfigUpdateRequestType,
} = require("../../validations/app.validations");

const router = express.Router();

router.get(
  appPaths.details,
  verification.verifyAdminOrUser,
  handleError(controller.appConfigurations),
);

router.patch(
  appPaths.update,
  verification.verifyAdmin,
  validateRequest(appConfigUpdateRequestType),
  handleError(controller.updateAppConfig),
);

module.exports = router;

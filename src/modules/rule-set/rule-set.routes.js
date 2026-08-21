const express = require("express");
const ruleSetPaths = require("./rule-set.paths");
const controller = require("./rule-set.controller");
const { handleError } = require("../../utils/heplers");
const validateRequest = require("../../middlewares/validator");
const {
  ruleSetCreateRequestType,
  ruleSetUpdateRequestType,
} = require("../../validations/rule-set.validations");
const { paginationType } = require("../../validations/global.validations");
const verification = require("../../middlewares/jwtVerification");

const router = express.Router();

router.post(
  ruleSetPaths.adminList,
  verification.verifyAdmin,
  validateRequest(paginationType),
  handleError(controller.listRuleSets),
);

router.post(
  ruleSetPaths.adminCreate,
  verification.verifyAdmin,
  validateRequest(ruleSetCreateRequestType),
  handleError(controller.createRuleSet),
);

router.get(
  ruleSetPaths.adminDetails,
  verification.verifyAdmin,
  handleError(controller.getRuleSetDetails),
);

router.patch(
  ruleSetPaths.adminUpdate,
  verification.verifyAdmin,
  validateRequest(ruleSetUpdateRequestType),
  handleError(controller.updateRuleSet),
);

router.delete(
  ruleSetPaths.adminDelete,
  verification.verifyAdmin,
  handleError(controller.deleteRuleSet),
);

module.exports = router;

const express = require("express");
const rolePaths = require("./role.paths");
const controller = require("./role.controller");
const { handleError } = require("../../utils/heplers");
const validateRequest = require("../../middlewares/validator");
const {
  createRoleRequestType,
  updateRoleRequestType,
} = require("../../validations/role.validations");
const verification = require("../../middlewares/jwtVerification");

const router = express.Router();

// All role management routes are admin only
router.use(verification.verifyAdmin);

router.post(
  rolePaths.create,
  validateRequest(createRoleRequestType),
  handleError(controller.createRole)
);

router.get(rolePaths.list, handleError(controller.getRoles));

router.patch(
  rolePaths.update,
  validateRequest(updateRoleRequestType),
  handleError(controller.updateRole)
);

router.delete(rolePaths.delete, handleError(controller.deleteRole));

module.exports = router;

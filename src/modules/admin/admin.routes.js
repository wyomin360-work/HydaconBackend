const express = require("express");
const adminPaths = require("./admin.paths");
const controller = require("./admin.controller");
const { handleError } = require("../../utils/heplers");
const validateRequest = require("../../middlewares/validator");
const {
  adminRegisterRequestType,
  adminLoginRequestType,
  adminAuditLogsRequestType,
  adminCreateRequestType,
  adminUpdateRequestType,
} = require("../../validations/admin.validations");
const verification = require("../../middlewares/jwtVerification");

const router = express.Router();

// Admin Management (Protected: Only valid admin can create/manage admins)
router.post(
  adminPaths.create,
  verification.verifyAdmin,
  validateRequest(adminCreateRequestType),
  handleError(controller.createAdmin),
);

router.post(
  adminPaths.update,
  verification.verifyAdmin,
  validateRequest(adminUpdateRequestType),
  handleError(controller.updateAdmin),
);

router.post(
  adminPaths.details,
  verification.verifyAdmin,
  handleError(controller.adminDetails),
);

// Auth
router.post(
  adminPaths.auth.register,
  verification.verifyAdmin,
  validateRequest(adminRegisterRequestType),
  handleError(controller.register),
);

router.post(
  adminPaths.auth.login,
  validateRequest(adminLoginRequestType),
  handleError(controller.login),
);

router.post(
  adminPaths.auth.logout,
  verification.verifyAdmin,
  handleError(controller.logout),
);
router.post(
  adminPaths.auth.forgotPassword,
  handleError(controller.forgotPassword),
);

router.post(
  adminPaths.auth.resetPassword,
  handleError(controller.resetPassword),
);

router.put(
  adminPaths.auth.updateDetails,
  verification.verifyAdmin,
  handleError(controller.updateDetails),
);

router.post(
  adminPaths.list,
  verification.verifyAdmin,
  handleError(controller.adminList),
);

router.post(
  adminPaths.auditLogs.phoneNumberChanges,
  verification.verifyAdmin,
  validateRequest(adminAuditLogsRequestType),
  handleError(controller.phoneNumberChangeAuditLogs),
);

router.delete(
  adminPaths.delete,
  verification.verifyAdmin,
  handleError(controller.adminDelete),
);

module.exports = router;

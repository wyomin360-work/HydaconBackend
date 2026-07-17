const express = require("express");
const { handleError } = require("../../utils/heplers");
const controller = require("./user.controller");
const userPaths = require("./user.paths");
const roleController = require("../roles/role.controller");
const verification = require("../../middlewares/jwtVerification");
const {
  userLoginRequestType,
  userOtpLoginRequestType,
  userRegisterRequestType,
  userBankDetailsRequestType,
  userProfileUpdateRequestType,
  userFcmRequestType,
  verifyOldNumberRequestType,
  verifyNewNumberRequestType,
} = require("../../validations/user.validations");
const validateRequest = require("../../middlewares/validator");
const upload = require("../../middlewares/multer");
const rateLimiter = require("../../middlewares/rateLimiter");

const otpRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many OTP requests. Please try again after 15 minutes.",
});

const router = express.Router();

// Auth
router.post(
  userPaths.auth.login,
  validateRequest(userLoginRequestType),
  handleError(controller.login),
);

router.post(
  userPaths.auth.register,
  validateRequest(userRegisterRequestType),
  handleError(controller.register),
);

router.post(
  userPaths.auth.authenticateWithProvider,
  handleError(controller.providerAuth),
);

router.post(
  userPaths.auth.logout,
  verification.verifyUser,
  handleError(controller.logout),
);

router.post(
  userPaths.auth.verifyEmail,
  otpRateLimiter,
  handleError(controller.verifyEmail),
);

router.post(userPaths.auth.verifyOtp, handleError(controller.verifyOtp));

router.patch(
  userPaths.auth.resetPassword,
  handleError(controller.resetPassword),
);

router.post(
  userPaths.auth.simpleLoginWithOtp,
  validateRequest(userOtpLoginRequestType),
  otpRateLimiter,
  handleError(controller.simpleLoginWithOtp),
);

router.get(userPaths.roles, handleError(roleController.getRoles));

// ---------------------------------------------
// User details
router.get(
  userPaths.details,
  verification.verifyUser,
  handleError(controller.userDetails),
);

router.get(
  userPaths.adminDetails,
  verification.verifyAdmin,
  handleError(controller.getAdminUserDetails),
);

router.patch(
  userPaths.updateProfile,
  verification.verifyUser,
  validateRequest(userProfileUpdateRequestType),
  handleError(controller.updateProfile),
);

router.post(
  userPaths.profilePhoto,
  verification.verifyUser,
  handleError(controller.uploadProfilePhoto),
);

router.patch(
  userPaths.updatePreferences,
  verification.verifyUser,
  handleError(controller.updatePreferences),
);

router.post(
  userPaths.fcmToken,
  verification.verifyUser,
  validateRequest(userFcmRequestType),
  handleError(controller.addFcmToken),
);

router.post(
  userPaths.phone.verifyOldNumber,
  verification.verifyUser,
  validateRequest(verifyOldNumberRequestType),
  handleError(controller.verifyOldNumber),
);

router.post(
  userPaths.phone.verifyNewNumber,
  verification.verifyUser,
  validateRequest(verifyNewNumberRequestType),
  handleError(controller.verifyNewNumber),
);

// ---------------------------------------------
// Bank details
router.get(
  userPaths.bank.details,
  verification.verifyUser,
  handleError(controller.userBankDetails),
);

router.post(
  userPaths.bank.create,
  verification.verifyUser,
  validateRequest(userBankDetailsRequestType),
  handleError(controller.addBankDetails),
);

router.patch(
  userPaths.bank.update,
  verification.verifyUser,
  validateRequest(userBankDetailsRequestType),
  handleError(controller.updateBankDetails),
);

router.delete(
  userPaths.bank.delete,
  verification.verifyUser,
  handleError(controller.deleteBankDetails),
);

router.post(
  userPaths.list,
  verification.verifyAdmin,
  handleError(controller.userList),
);

router.patch(
  userPaths.flagUser,
  verification.verifyAdmin,
  handleError(controller.flagUser),
);

router.post(
  userPaths.convertPoints,
  verification.verifyUser,
  handleError(controller.convertPoints),
);

router.patch(
  userPaths.toggleStatus,
  verification.verifyAdmin,
  handleError(controller.toggleUserStatus),
);

router.delete(
  userPaths.deleteUser,
  verification.verifyAdmin,
  handleError(controller.deleteUser),
);

router.patch(
  userPaths.releaseBan,
  verification.verifyAdmin,
  handleError(controller.releaseBan),
);

module.exports = router;

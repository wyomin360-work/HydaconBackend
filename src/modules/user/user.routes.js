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

router.post(userPaths.auth.verifyEmail, handleError(controller.verifyEmail));

router.post(userPaths.auth.verifyOtp, handleError(controller.verifyOtp));

router.patch(
  userPaths.auth.resetPassword,
  handleError(controller.resetPassword),
);

router.get(
    userPaths.roles,
    handleError(roleController.getRoles)
)
router.post(
  userPaths.auth.simpleLoginWithOtp,
  validateRequest(userOtpLoginRequestType),
  handleError(controller.simpleLoginWithOtp),
);

// ---------------------------------------------
// User details
router.get(
  userPaths.details,
  verification.verifyUser,
  handleError(controller.userDetails),
);

router.patch(
  userPaths.updateProfile,
  verification.verifyUser,
  validateRequest(userProfileUpdateRequestType),
  handleError(controller.updateProfile),
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

module.exports = router;

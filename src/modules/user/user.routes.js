const express = require("express");
const { handleError } = require("../../utils/heplers");
const controller = require('./user.controller');
const userPaths = require("./user.paths");
const verification = require("../../middlewares/jwtVerification");
const { userLoginRequestType, userRegisterRequestType } = require("../../validations/user.validations");
const validateRequest = require("../../middlewares/validator");

const router = express.Router()

// Auth
router.post(
    userPaths.auth.login,
    validateRequest(userLoginRequestType),
    handleError(controller.login)
)

router.post(
    userPaths.auth.register,
    validateRequest(userRegisterRequestType),
    handleError(controller.register)
)

router.post(
    userPaths.auth.logout,
    verification.verifyUser,
    handleError(controller.logout)
)

module.exports = router
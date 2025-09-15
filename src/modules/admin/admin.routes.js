const express = require('express')
const adminPaths = require('./admin.paths')
const controller = require('./admin.controller')
const { handleError } = require('../../utils/heplers')
const validateRequest = require('../../middlewares/validator')
const { adminRegisterRequestType, adminLoginRequestType } = require('../../validations/admin.validations')
const verification = require('../../middlewares/jwtVerification')

const router = express.Router()

// Auth
router.post(
    adminPaths.auth.register,
    validateRequest(adminRegisterRequestType),
    handleError(controller.register)
)

router.post(
    adminPaths.auth.login,
    validateRequest(adminLoginRequestType),
    handleError(controller.login)
)

router.post(
    adminPaths.auth.logout,
    verification.verifyAdmin,
    handleError(controller.logout)
)
router.post(
    adminPaths.auth.forgotPassword, 
     handleError(controller.forgotPassword)
);

router.post(
    adminPaths.auth.resetPassword, 
    handleError(controller.resetPassword)
);


module.exports = router
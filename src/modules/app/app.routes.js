const express = require('express')
const appPaths = require('./app.paths')
const verification = require("../../middlewares/jwtVerification");
const controller = require('./app.controller');
const { handleError } = require('../../utils/heplers');


const router = express.Router()

router.get(
    appPaths.details,
    verification.verifyAdminOrUser,
    handleError(controller.appConfigurations)
)

router.patch(
    appPaths.update,
    verification.verifyAdmin,
    handleError(controller.updateAppConfig)
)

module.exports = router
const express = require('express')
const commonPaths = require('./common.paths')
const commonController = require('./common.controller')
const { handleError } = require('../../utils/heplers')
const upload = require('../../middlewares/multer')
const verification = require('../../middlewares/jwtVerification')
const router = express.Router()

router.post(
    commonPaths.imageUpload,
    verification.verifyAdmin,
    upload.single('image'),
    handleError(commonController.uploadImage)
)

router.post(
    commonPaths.renewToken,
    handleError(commonController.renewToken)
)

module.exports = router
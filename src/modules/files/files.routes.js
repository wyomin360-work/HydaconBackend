const express = require("express");
const filesPaths = require("./files.paths");
const filesController = require("./files.controller");

const router = express.Router();

router.get(filesPaths.presignedUrl, filesController.generatePresignedUrl);
router.get(filesPaths.verifyUrl, filesController.verifyFileUrl);

module.exports = router;

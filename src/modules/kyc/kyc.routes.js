const express = require("express");
const kycPaths = require("./kyc.paths");
const controller = require("./kyc.controller");
const { handleError } = require("../../utils/heplers");
const verification = require("../../middlewares/jwtVerification");
const upload = require("../../middlewares/multer");

const router = express.Router();

// User-facing endpoints
router.post(
  kycPaths.upload,
  verification.verifyUser,
  upload.fields([
    { name: 'document', maxCount: 1 },
    { name: 'image', maxCount: 1 }
  ]),
  handleError(controller.uploadKycDocument)
);

router.get(
  kycPaths.status,
  verification.verifyUser,
  handleError(controller.getKycStatus)
);

// Admin-facing endpoints
router.get(
  kycPaths.adminList,
  verification.verifyAdmin,
  handleError(controller.getAdminKycList)
);

router.patch(
  kycPaths.adminReview,
  verification.verifyAdmin,
  handleError(controller.reviewKycDocument)
);

module.exports = router;

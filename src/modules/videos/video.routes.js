const express = require("express");
const videoPaths = require("./video.paths");
const videoController = require("./video.controller");
const { handleError } = require("../../utils/heplers");
const validateRequest = require("../../middlewares/validator");
const {
  videoCreateRequestType,
  videoUpdateRequestType,
} = require("../../validations/video.validations");
const { paginationType } = require("../../validations/global.validations");
const { verifyAdmin, verifyAdminOrUser, verifyUser } = require("../../middlewares/jwtVerification");

const router = express.Router();

// Public / User / Admin Routes
// Featured videos (Mobile App usually needs this)
router.get(
  videoPaths.featured,
  verifyAdminOrUser,
  handleError(videoController.getFeaturedVideos)
);

// Metrics increment (usually by user/mobile)
router.post(
  videoPaths.metrics,
  verifyAdminOrUser,
  handleError(videoController.updateMetrics)
);

// Get Video List (used by admin dashboard but could be used by users with different filters if needed, restricting to AdminOrUser for now)
router.post(
  videoPaths.list,
  verifyAdminOrUser,
  validateRequest(paginationType),
  handleError(videoController.listVideos)
);

// Counts endpoint (admin or user)
router.get(
  videoPaths.counts,
  verifyAdminOrUser,
  handleError(videoController.getVideoCounts)
);

// Get Single Video Details
router.get(
  videoPaths.details,
  verifyAdminOrUser,
  handleError(videoController.getVideo)
);

// Admin Only Routes
router.post(
  videoPaths.create,
  verifyAdmin,
  validateRequest(videoCreateRequestType),
  handleError(videoController.createVideo)
);

router.patch(
  videoPaths.update,
  verifyAdmin,
  validateRequest(videoUpdateRequestType),
  handleError(videoController.updateVideo)
);

router.delete(
  videoPaths.delete,
  verifyAdmin,
  handleError(videoController.deleteVideo)
);

router.patch(
  videoPaths.toggleStatus,
  verifyAdmin,
  handleError(videoController.toggleStatus)
);

// Soft Delete and Restore routes (admin only)
router.patch(
  videoPaths.softDelete,
  verifyAdmin,
  handleError(videoController.softDeleteVideo)
);

router.patch(
  videoPaths.restore,
  verifyAdmin,
  handleError(videoController.restoreVideo)
);



module.exports = router;

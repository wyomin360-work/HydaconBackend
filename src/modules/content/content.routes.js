const express = require("express");
const contentPaths = require("./content.paths");
const verification = require("../../middlewares/jwtVerification");
const { handleError } = require("../../utils/heplers");
const validateRequest = require("../../middlewares/validator");
const {
  createContentRequestType,
  updateContentRequestType,
} = require("../../validations/content.validations");
const controller = require("./content.controller");

const router = express.Router();

// Admin Routes
router.get(
  contentPaths.ADMIN_LIST,
  verification.verifyAdmin,
  handleError(controller.listContentAdmin),
);

router.post(
  contentPaths.ADMIN_CREATE,
  verification.verifyAdmin,
  validateRequest(createContentRequestType),
  handleError(controller.createContent),
);

router.patch(
  contentPaths.ADMIN_UPDATE,
  verification.verifyAdmin,
  validateRequest(updateContentRequestType),
  handleError(controller.updateContent),
);

router.delete(
  contentPaths.ADMIN_DELETE,
  verification.verifyAdmin,
  handleError(controller.deleteContent),
);

router.get(
  contentPaths.ADMIN_DETAILS,
  verification.verifyAdmin,
  handleError(controller.getContentDetails),
);

// App Routes (Typically accessed by mobile app)
router.get(
  contentPaths.APP_HOMEPAGE,
  // potentially verification.verifyUser if needed, but often homepage content is public or user-specific.
  // Sticking to public for now unless specified.
  handleError(controller.getHomepageContent),
);

router.get(
  contentPaths.APP_PLACEMENT,
  handleError(controller.getPlacementContent),
);

router.get(contentPaths.APP_DETAILS, handleError(controller.getContentDetails));

router.post(
  contentPaths.APP_TRACK_VIEW,
  verification.verifyUser,
  handleError(controller.trackContentView)
);

module.exports = router;

const express = require("express");
const paths = require("./scratch-cards.paths");
const verification = require("../../middlewares/jwtVerification");
const { handleError } = require("../../utils/heplers");
const controller = require("./scratch-cards.controller");

const router = express.Router();

// Admin Campaign Routes
router.get(
  paths.ADMIN_CAMPAIGN_LIST,
  verification.verifyAdmin,
  handleError(controller.listCampaigns)
);
router.get(
  paths.ADMIN_CAMPAIGN_GET,
  verification.verifyAdmin,
  handleError(controller.getCampaignById)
);
router.post(
  paths.ADMIN_CAMPAIGN_CREATE,
  verification.verifyAdmin,
  handleError(controller.createCampaign)
);
router.patch(
  paths.ADMIN_CAMPAIGN_UPDATE,
  verification.verifyAdmin,
  handleError(controller.updateCampaign)
);
router.delete(
  paths.ADMIN_CAMPAIGN_DELETE,
  verification.verifyAdmin,
  handleError(controller.deleteCampaign)
);
router.get(
  paths.ADMIN_CAMPAIGN_STATS,
  verification.verifyAdmin,
  handleError(controller.getCampaignStats)
);

// User Scratch Card Routes
router.get(
  paths.USER_LIST,
  verification.verifyUser,
  handleError(controller.listUserScratchCards)
);
router.post(
  paths.USER_REVEAL,
  verification.verifyUser,
  handleError(controller.revealScratchCard)
);

module.exports = router;

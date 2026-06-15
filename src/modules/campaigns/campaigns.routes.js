const express = require("express");
const campaignsPath = require("./campaigns.paths");
const verification = require("../../middlewares/jwtVerification");
const { handleError } = require("../../utils/heplers");
const controller = require("./campaigns.controller");

const router = express.Router();

router.get(
  campaignsPath.USER_LIST,
  verification.verifyUser,
  handleError(controller.listCampaignsForUser),
);

router.get(
  campaignsPath.ADMIN_LIST,
  verification.verifyAdmin,
  handleError(controller.listCampaignsAdmin),
);

router.post(
  campaignsPath.ADMIN_CREATE,
  verification.verifyAdmin,
  handleError(controller.createCampaign),
);

router.patch(
  campaignsPath.ADMIN_UPDATE,
  verification.verifyAdmin,
  handleError(controller.updateCampaign),
);

router.delete(
  campaignsPath.ADMIN_DELETE,
  verification.verifyAdmin,
  handleError(controller.deleteCampaign),
);

module.exports = router;

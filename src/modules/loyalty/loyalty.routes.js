const express = require("express");
const { handleError } = require("../../utils/heplers");
const controller = require("./loyalty.controller");
const loyaltyPaths = require("./loyalty.paths");
const verification = require("../../middlewares/jwtVerification");

const router = express.Router();

// User Loyalty Summary Endpoint (Mobile App integration)
router.get(
  loyaltyPaths.summary,
  verification.verifyUser,
  handleError(controller.getUserSummary)
);

// Admin Loyalty Tier Management Endpoints
router.post(
  loyaltyPaths.admin.tiers,
  verification.verifyAdmin,
  handleError(controller.createTier)
);
router.get(
  loyaltyPaths.admin.tiers,
  verification.verifyAdmin,
  handleError(controller.listTiers)
);
router.patch(
  loyaltyPaths.admin.tiersDetail,
  verification.verifyAdmin,
  handleError(controller.updateTier)
);
router.delete(
  loyaltyPaths.admin.tiersDetail,
  verification.verifyAdmin,
  handleError(controller.deleteTier)
);

// Admin Loyalty Seasons Endpoints
router.post(
  loyaltyPaths.admin.seasons,
  verification.verifyAdmin,
  handleError(controller.createSeason)
);
router.get(
  loyaltyPaths.admin.seasons,
  verification.verifyAdmin,
  handleError(controller.listSeasons)
);
router.patch(
  loyaltyPaths.admin.seasonsActivate,
  verification.verifyAdmin,
  handleError(controller.activateSeason)
);
router.patch(
  loyaltyPaths.admin.seasonsDetail,
  verification.verifyAdmin,
  handleError(controller.updateSeason)
);
router.delete(
  loyaltyPaths.admin.seasonsDetail,
  verification.verifyAdmin,
  handleError(controller.deleteSeason)
);

// Admin Loyalty Seasonal Configurations
router.post(
  loyaltyPaths.admin.tierConfigurations,
  verification.verifyAdmin,
  handleError(controller.createTierConfiguration)
);
router.get(
  loyaltyPaths.admin.tierConfigurations,
  verification.verifyAdmin,
  handleError(controller.listTierConfigurations)
);
router.patch(
  loyaltyPaths.admin.tierConfigurationsDetail,
  verification.verifyAdmin,
  handleError(controller.updateTierConfiguration)
);
router.delete(
  loyaltyPaths.admin.tierConfigurationsDetail,
  verification.verifyAdmin,
  handleError(controller.deleteTierConfiguration)
);

// Admin Benefits Endpoints
router.post(
  loyaltyPaths.admin.benefits,
  verification.verifyAdmin,
  handleError(controller.createBenefit)
);
router.get(
  loyaltyPaths.admin.benefits,
  verification.verifyAdmin,
  handleError(controller.listBenefits)
);
router.patch(
  loyaltyPaths.admin.benefitsDetail,
  verification.verifyAdmin,
  handleError(controller.updateBenefit)
);
router.delete(
  loyaltyPaths.admin.benefitsDetail,
  verification.verifyAdmin,
  handleError(controller.deleteBenefit)
);

module.exports = router;

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
  handleError(controller.getUserSummary),
);

// User Tier Progression Metadata Endpoint (Mobile App integration)
router.get(
  loyaltyPaths.progression,
  verification.verifyUser,
  handleError(controller.getTierProgression),
);

// Admin Loyalty Tier Management Endpoints
router.post(
  loyaltyPaths.admin.tiers,
  verification.verifyAdmin,
  handleError(controller.createTier),
);
router.get(
  loyaltyPaths.admin.tiers,
  verification.verifyAdmin,
  handleError(controller.listTiers),
);
router.patch(
  loyaltyPaths.admin.tiersDetail,
  verification.verifyAdmin,
  handleError(controller.updateTier),
);
router.delete(
  loyaltyPaths.admin.tiersDetail,
  verification.verifyAdmin,
  handleError(controller.deleteTier),
);

// Admin Loyalty Seasons Endpoints
router.post(
  loyaltyPaths.admin.seasons,
  verification.verifyAdmin,
  handleError(controller.createSeason),
);
router.get(
  loyaltyPaths.admin.seasons,
  verification.verifyAdmin,
  handleError(controller.listSeasons),
);
router.get(
  loyaltyPaths.admin.seasonSummary,
  verification.verifyAdmin,
  handleError(controller.getSeasonManagementSummary),
);
router.patch(
  loyaltyPaths.admin.seasonsActivate,
  verification.verifyAdmin,
  handleError(controller.activateSeason),
);
router.patch(
  loyaltyPaths.admin.seasonsDeactivate,
  verification.verifyAdmin,
  handleError(controller.deactivateSeason),
);
router.patch(
  loyaltyPaths.admin.seasonsDetail,
  verification.verifyAdmin,
  handleError(controller.updateSeason),
);
router.delete(
  loyaltyPaths.admin.seasonsDetail,
  verification.verifyAdmin,
  handleError(controller.deleteSeason),
);
router.get(
  loyaltyPaths.admin.seasonsDetail,
  verification.verifyAdmin,
  handleError(controller.getSeasonById),
);

// Admin Loyalty Seasonal Configurations
router.post(
  loyaltyPaths.admin.tierConfigurations,
  verification.verifyAdmin,
  handleError(controller.createTierConfiguration),
);
router.get(
  loyaltyPaths.admin.tierConfigurations,
  verification.verifyAdmin,
  handleError(controller.listTierConfigurations),
);
router.get(
  loyaltyPaths.admin.tierConfigurationHistory,
  verification.verifyAdmin,
  handleError(controller.getTierConfigurationHistory),
);
router.get(
  loyaltyPaths.admin.configAuditLogs,
  verification.verifyAdmin,
  handleError(controller.listConfigurationAuditLogs),
);
router.get(
  loyaltyPaths.admin.configAuditLogDetail,
  verification.verifyAdmin,
  handleError(controller.getConfigAuditLogById),
);
router.patch(
  loyaltyPaths.admin.tierConfigurationsDetail,
  verification.verifyAdmin,
  handleError(controller.updateTierConfiguration),
);
router.delete(
  loyaltyPaths.admin.tierConfigurationsDetail,
  verification.verifyAdmin,
  handleError(controller.deleteTierConfiguration),
);

// Admin Benefits Endpoints
router.post(
  loyaltyPaths.admin.benefits,
  verification.verifyAdmin,
  handleError(controller.createBenefit),
);
router.get(
  loyaltyPaths.admin.benefits,
  verification.verifyAdmin,
  handleError(controller.listBenefits),
);
router.patch(
  loyaltyPaths.admin.benefitsDetail,
  verification.verifyAdmin,
  handleError(controller.updateBenefit),
);
router.delete(
  loyaltyPaths.admin.benefitsDetail,
  verification.verifyAdmin,
  handleError(controller.deleteBenefit),
);

module.exports = router;

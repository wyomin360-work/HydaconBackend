const loyaltyService = require("./loyalty.service");
const Tier = require("../../schemas/tier.schema");
const LoyaltySeason = require("../../schemas/loyalty-season.schema");
const TierBenefit = require("../../schemas/tier-benefit.schema");
const TierConfiguration = require("../../schemas/tier-configuration.schema");
const { sendResponse } = require("../../utils/responseHandlers");

/**
 * Mobile App API: Retrieves user's loyalty summary card, current and next tier progress.
 */
async function getUserSummary(req, res) {
  const userId = req.userId;
  const summary = await loyaltyService.getUserLoyaltySummary(userId);
  return sendResponse(res, summary, 200);
}

// ----------------------------------------------------
// Admin Configuration APIs
// ----------------------------------------------------

/**
 * Admin API: Creates a new loyalty tier definition.
 */
async function createTier(req, res) {
  const { name, key, colorIdentity, badgeUrl, rank } = req.body;
  const tier = await Tier.create({ name, key, colorIdentity, badgeUrl, rank });
  return sendResponse(res, tier, 201);
}

/**
 * Admin API: Lists all configured loyalty tiers.
 */
async function listTiers(req, res) {
  const tiers = await Tier.find().sort({ rank: 1 });
  return sendResponse(res, tiers, 200);
}

/**
 * Admin API: Updates an existing loyalty tier.
 */
async function updateTier(req, res) {
  const tierId = req.params.id;
  const tier = await Tier.findByIdAndUpdate(tierId, req.body, { new: true });
  return sendResponse(res, tier, 200);
}

/**
 * Admin API: Creates a loyalty season.
 */
async function createSeason(req, res) {
  const season = await loyaltyService.createSeason(req.userId, req.body);
  return sendResponse(res, season, 201);
}

/**
 * Admin API: Lists all loyalty seasons.
 */
async function listSeasons(req, res) {
  const includeArchived = req.query.includeArchived === "true";
  const seasons = await LoyaltySeason.find(
    includeArchived ? {} : { isArchived: { $ne: true } }
  ).sort({ startDate: -1 });
  return sendResponse(res, seasons, 200);
}

/**
 * Admin API: Explicitly activates a loyalty season and deactivates others.
 */
async function activateSeason(req, res) {
  const seasonId = req.params.id;
  const activeSeason = await loyaltyService.activateSeason(req.userId, seasonId);
  return sendResponse(res, activeSeason, 200);
}

/**
 * Admin API: Creates a dynamic tier configuration for a season.
 */
async function createTierConfiguration(req, res) {
  const config = await loyaltyService.createTierConfiguration(req.userId, req.body);
  return sendResponse(res, config, 201);
}

/**
 * Admin API: Lists tier configurations (optionally filtered by season).
 */
async function listTierConfigurations(req, res) {
  const { seasonId } = req.query;
  const query = {};
  if (seasonId) {
    query.seasonId = seasonId;
  }
  if (req.query.includeArchived !== "true") {
    query.isArchived = { $ne: true };
  }
  const configs = await TierConfiguration.find(query)
    .populate("tierId")
    .populate("benefits")
    .exec();

  return sendResponse(res, configs, 200);
}

/**
 * Admin API: Updates a tier configuration.
 */
async function updateTierConfiguration(req, res) {
  const configId = req.params.id;
  const config = await loyaltyService.updateTierConfiguration(req.userId, configId, req.body);
  return sendResponse(res, config, 200);
}

/**
 * Admin API: Creates a dynamic benefit metadata entry.
 */
async function createBenefit(req, res) {
  const { name, description, key, active } = req.body;
  const benefit = await TierBenefit.create({ name, description, key, active });
  return sendResponse(res, benefit, 201);
}

/**
 * Admin API: Lists configured benefit items.
 */
async function listBenefits(req, res) {
  const benefits = await TierBenefit.find();
  return sendResponse(res, benefits, 200);
}

/**
 * Admin API: Updates an existing season generally.
 */
async function updateSeason(req, res) {
  const seasonId = req.params.id;
  if (req.body.active === true) {
    await LoyaltySeason.updateMany({ _id: { $ne: seasonId } }, { active: false });
  }
  const season = await LoyaltySeason.findByIdAndUpdate(seasonId, req.body, { new: true });
  return sendResponse(res, season, 200);
}

async function deactivateSeason(req, res) {
  const season = await loyaltyService.deactivateSeason(req.userId, req.params.id);
  return sendResponse(res, season, 200);
}

/**
 * Admin API: Deletes a loyalty season.
 */
async function deleteSeason(req, res) {
  const seasonId = req.params.id;
  await LoyaltySeason.findByIdAndDelete(seasonId);
  return sendResponse(res, { message: "Season deleted successfully" }, 200);
}

async function getSeasonManagementSummary(req, res) {
  const summary = await loyaltyService.getSeasonManagementSummary();
  return sendResponse(res, summary, 200);
}

async function listConfigurationAuditLogs(req, res) {
  const logs = await loyaltyService.listConfigurationAuditLogs(req.query);
  return sendResponse(res, logs, 200);
}

async function getTierConfigurationHistory(req, res) {
  const history = await loyaltyService.getTierConfigurationHistory(req.params.id);
  return sendResponse(res, history, 200);
}

/**
 * Admin API: Deletes a loyalty tier definition.
 */
async function deleteTier(req, res) {
  const tierId = req.params.id;
  await Tier.findByIdAndDelete(tierId);
  return sendResponse(res, { message: "Tier deleted successfully" }, 200);
}

/**
 * Admin API: Deletes a tier configuration.
 */
async function deleteTierConfiguration(req, res) {
  const configId = req.params.id;
  await TierConfiguration.findByIdAndDelete(configId);
  return sendResponse(res, { message: "Tier configuration deleted successfully" }, 200);
}

/**
 * Admin API: Updates an existing benefit.
 */
async function updateBenefit(req, res) {
  const benefitId = req.params.id;
  const benefit = await TierBenefit.findByIdAndUpdate(benefitId, req.body, { new: true });
  return sendResponse(res, benefit, 200);
}

/**
 * Admin API: Deletes a benefit.
 */
async function deleteBenefit(req, res) {
  const benefitId = req.params.id;
  await TierBenefit.findByIdAndDelete(benefitId);
  return sendResponse(res, { message: "Benefit deleted successfully" }, 200);
}

module.exports = {
  getUserSummary,
  createTier,
  listTiers,
  updateTier,
  deleteTier,
  createSeason,
  listSeasons,
  updateSeason,
  activateSeason,
  deactivateSeason,
  deleteSeason,
  createTierConfiguration,
  listTierConfigurations,
  updateTierConfiguration,
  deleteTierConfiguration,
  createBenefit,
  listBenefits,
  updateBenefit,
  deleteBenefit,
  getSeasonManagementSummary,
  listConfigurationAuditLogs,
  getTierConfigurationHistory,
};

const loyaltyService = require("./loyalty.service");
const Tier = require("../../schemas/tier.schema");
const LoyaltySeason = require("../../schemas/loyalty-season.schema");
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

/**
 * Mobile App API: Retrieves the full tier progression ladder for the active season,
 * enriched with per-user unlock/current/next flags.
 */
async function getTierProgression(req, res) {
  const userId = req.userId;
  const progression = await loyaltyService.getTierProgressionMetadata(userId);
  return sendResponse(res, progression, 200);
}

/**
 * Mobile App API: Claims unlocked tier rewards for the active season.
 */
async function claimTierReward(req, res) {
  const userId = req.userId;
  const payload = {
    seasonId: req.params?.seasonId || req.body?.seasonId,
    tierId: req.params?.tierId || req.body?.tierId,
  };
  const result = await loyaltyService.claimTierReward(userId, payload);
  return sendResponse(res, result, 200);
}

// ----------------------------------------------------
// Admin Configuration APIs
// ----------------------------------------------------

/**
 * Admin API: Creates a new loyalty tier definition.
 */
async function createTier(req, res) {
  const {
    name,
    key,
    colorIdentity,
    badgeUrl,
    rank,
    qualificationPoint,
    threshold,
    active,
  } = req.body;
  await loyaltyService.validateTierRange(req.body);
  const tier = await Tier.create({
    name,
    key,
    colorIdentity,
    badgeUrl,
    rank,
    qualificationPoint,
    threshold,
    active,
  });
  return sendResponse(res, tier, 201);
}

/**
 * Admin API: Lists all configured loyalty tiers (paginated).
 */
async function listTiers(req, res) {
  const result = await loyaltyService.listTiers(req.query);
  return sendResponse(res, result, 200);
}

/**
 * Admin API: Updates an existing loyalty tier.
 */
async function updateTier(req, res) {
  const tierId = req.params.id;
  await loyaltyService.validateTierRange(req.body, tierId);
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
 * Admin API: Lists all loyalty seasons (paginated).
 */
async function listSeasons(req, res) {
  const result = await loyaltyService.listSeasons(req.query);
  return sendResponse(res, result, 200);
}

/**
 * Admin API: Explicitly activates a loyalty season and deactivates others.
 */
async function activateSeason(req, res) {
  const seasonId = req.params.id;
  const activeSeason = await loyaltyService.activateSeason(
    req.userId,
    seasonId,
  );
  return sendResponse(res, activeSeason, 200);
}

/**
 * Admin API: Creates a dynamic tier configuration for a season.
 */
async function createTierConfiguration(req, res) {
  const config = await loyaltyService.createTierConfiguration(
    req.userId,
    req.body,
  );
  return sendResponse(res, config, 201);
}

/**
 * Admin API: Lists tier configurations (paginated, optionally filtered by season).
 */
async function listTierConfigurations(req, res) {
  const result = await loyaltyService.listTierConfigurations(req.query);
  return sendResponse(res, result, 200);
}

/**
 * Admin API: Updates a tier configuration.
 */
async function updateTierConfiguration(req, res) {
  const configId = req.params.id;
  const config = await loyaltyService.updateTierConfiguration(
    req.userId,
    configId,
    req.body,
  );
  return sendResponse(res, config, 200);
}

/**
 * Admin API: Updates an existing season generally.
 */
async function updateSeason(req, res) {
  const seasonId = req.params.id;
  if (req.body.active === true) {
    await LoyaltySeason.updateMany(
      { _id: { $ne: seasonId } },
      { active: false },
    );
  }
  const season = await LoyaltySeason.findByIdAndUpdate(seasonId, req.body, {
    new: true,
  });
  return sendResponse(res, season, 200);
}

async function deactivateSeason(req, res) {
  const season = await loyaltyService.deactivateSeason(
    req.userId,
    req.params.id,
  );
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
async function getSeasonById(req, res) {
  const season = await loyaltyService.getSeasonById(req.params.id);
  return sendResponse(res, { data: season }, 200);
}

async function getSeasonManagementSummary(req, res) {
  const summary = await loyaltyService.getSeasonManagementSummary();
  return sendResponse(res, summary, 200);
}

async function listConfigurationAuditLogs(req, res) {
  const logs = await loyaltyService.listConfigurationAuditLogs(req.query);
  return sendResponse(res, logs, 200);
}

async function getConfigAuditLogById(req, res) {
  const log = await loyaltyService.getConfigAuditLogById(req.params.id);
  return sendResponse(res, log, 200);
}

async function getTierConfigurationHistory(req, res) {
  const history = await loyaltyService.getTierConfigurationHistory(
    req.params.id,
    req.query,
  );
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
  const config = await TierConfiguration.findById(configId).populate("seasonId");
  if (!config) {
    return sendResponse(res, { message: "Tier configuration not found" }, 404);
  }
  if (config.seasonId && config.seasonId.startDate <= new Date()) {
    return res.status(400).json({ status: "fail", message: "Cannot modify tier configurations for started or completed seasons" });
  }
  await TierConfiguration.findByIdAndDelete(configId);
  return sendResponse(
    res,
    { message: "Tier configuration deleted successfully" },
    200,
  );
}

async function addPoints(req, res) {
  const userId = req.userId;
  const { points = 100 } = req.body;
  // Dev endpoint: uses processQrScanPoints to award QP + trigger tier upgrades
  const result = await loyaltyService.processQrScanPoints(
    userId,
    Number(points),
    `dev-add-${Date.now()}`,
  );
  return sendResponse(res, result, 200);
}

module.exports = {
  getUserSummary,
  getTierProgression,
  addPoints,
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
  getSeasonManagementSummary,
  listConfigurationAuditLogs,
  getConfigAuditLogById,
  getTierConfigurationHistory,
  getSeasonById,
  claimTierReward,
};

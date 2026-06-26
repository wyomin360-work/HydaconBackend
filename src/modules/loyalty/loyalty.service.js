const seeder = require("./loyalty-seeder.service");
const user = require("./loyalty-user.service");
const season = require("./loyalty-season.service");
const tier = require("./loyalty-tier.service");
const benefit = require("./loyalty-benefit.service");
const audit = require("./loyalty-audit.service");

module.exports = {
  // Seeder
  seedDefaultLoyaltyData: seeder.seedDefaultLoyaltyData,

  // User
  getOrCreateUserProgress: user.getOrCreateUserProgress,
  processQrScanPoints: user.processQrScanPoints,
  addBonusPoints: user.addBonusPoints,
  evaluateTierUpgrade: user.evaluateTierUpgrade,
  getUserLoyaltySummary: user.getUserLoyaltySummary,
  getTierProgressionMetadata: user.getTierProgressionMetadata,

  // Seasons
  resolveActiveSeason: season.resolveActiveSeason,
  listSeasons: season.listSeasons,
  createSeason: season.createSeason,
  updateSeason: season.updateSeason,
  activateSeason: season.activateSeason,
  deactivateSeason: season.deactivateSeason,
  getSeasonManagementSummary: season.getSeasonManagementSummary,
  archiveSeason: season.archiveSeason,
  getSeasonById: season.getSeasonById,

  // Tiers & Configurations
  listTiers: tier.listTiers,
  listTierConfigurations: tier.listTierConfigurations,
  createTierConfiguration: tier.createTierConfiguration,
  updateTierConfiguration: tier.updateTierConfiguration,
  archiveTierConfiguration: tier.archiveTierConfiguration,
  validateTierRange: tier.validateTierRange,

  // Benefits
  listBenefits: benefit.listBenefits,

  // Auditing
  listConfigurationAuditLogs: audit.listConfigurationAuditLogs,
  getConfigAuditLogById: audit.getConfigAuditLogById,
  getTierConfigurationHistory: audit.getTierConfigurationHistory,
};

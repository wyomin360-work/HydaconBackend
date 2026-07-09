const Tier = require("../../schemas/tier.schema");
const LoyaltySeason = require("../../schemas/loyalty-season.schema");
const TierConfiguration = require("../../schemas/tier-configuration.schema");
const { resolveActiveSeason } = require("./loyalty-season.service");
const {
  recalculateTierConfigurationThresholds,
} = require("./loyalty-tier.service");

/**
 * Automatically seeds default tiers and active season if none exist.
 * This guarantees out-of-the-box system function without backend rewrite.
 */
async function seedDefaultLoyaltyData() {
  // 1. Seed Tiers
  let tierCount = await Tier.countDocuments();
  if (tierCount === 0) {
    const defaultTiers = [
      {
        name: "Beginner",
        key: "beginner",
        colorIdentity: "#8E8E93",
        badgeUrl: "badge_beginner",
        rank: 0,
        qualificationPoint: 0,
        threshold: 100,
      },
      {
        name: "Bronze",
        key: "bronze",
        colorIdentity: "#CD7F32",
        badgeUrl: "badge_bronze",
        rank: 1,
        qualificationPoint: 100,
        threshold: 400,
      },
      {
        name: "Silver",
        key: "silver",
        colorIdentity: "#C0C0C0",
        badgeUrl: "badge_silver",
        rank: 2,
        qualificationPoint: 500,
        threshold: 500,
      },
      {
        name: "Gold",
        key: "gold",
        colorIdentity: "#FFD700",
        badgeUrl: "badge_gold",
        rank: 3,
        qualificationPoint: 1000,
        threshold: 1000,
      },
      {
        name: "Platinum",
        key: "platinum",
        colorIdentity: "#E5E4E2",
        badgeUrl: "badge_platinum",
        rank: 4,
        qualificationPoint: 2000,
        threshold: 100000,
      },
    ];
    await Tier.create(defaultTiers);
    console.log("🌱 Default loyalty tiers successfully seeded.");
  }

  // 2. Seed active Season
  let activeSeason = await resolveActiveSeason();
  if (!activeSeason) {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endDate = new Date(now.getFullYear() + 1, now.getMonth(), 1);

    activeSeason = await LoyaltySeason.create({
      name: "Default Season 1",
      code: "DEFAULT_S1",
      startDate,
      endDate,
      active: true,
      activatedAt: new Date(),
    });
    if (!activeSeason) {
      activeSeason = await LoyaltySeason.findOne({ active: true });
    }
    console.log("🌱 Active Default Loyalty Season successfully seeded.");
  }

  // 3. Seed Tier Configurations for this Season
  let configCount = await TierConfiguration.countDocuments({
    seasonId: activeSeason._id,
  });
  if (configCount === 0) {
    const tiers = await Tier.find().sort({ rank: 1 });
    const configTemplates = {
      beginner: { threshold: 0, multiplier: 1.0 },
      bronze: { threshold: 100, multiplier: 1.1 },
      silver: { threshold: 500, multiplier: 1.2 },
      gold: { threshold: 1000, multiplier: 1.3 },
      platinum: { threshold: 2000, multiplier: 1.5 },
    };

    const configurations = [];
    for (const tier of tiers) {
      const template = configTemplates[tier.key] || {
        threshold: 0,
        multiplier: 1.0,
      };
      configurations.push({
        tierId: tier._id,
        seasonId: activeSeason._id,
        qualificationPoint: template.threshold,
        threshold: tier.threshold || 0,
        pointMultiplier: template.multiplier,
        active: true,
      });
    }
    await TierConfiguration.create(configurations);
    await recalculateTierConfigurationThresholds(activeSeason._id);
    console.log("🌱 Default loyalty configurations successfully seeded.");
  }

  return activeSeason;
}

module.exports = {
  seedDefaultLoyaltyData,
};

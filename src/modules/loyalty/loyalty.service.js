const Tier = require("../../schemas/tier.schema");
const LoyaltySeason = require("../../schemas/loyalty-season.schema");
const TierBenefit = require("../../schemas/tier-benefit.schema");
const TierConfiguration = require("../../schemas/tier-configuration.schema");
const UserTierProgress = require("../../schemas/user-tier-progress.schema");
const LoyaltyTransaction = require("../../schemas/loyalty-transaction.schema");
const User = require("../../schemas/user.schema");
const { sendFcmNotifications } = require("../../functions/fcm");
const { sendFailResponse } = require("../../utils/responseHandlers");

/**
 * Automatically seeds default tiers and active season if none exist.
 * This guarantees out-of-the-box system function without backend rewrite.
 */
async function seedDefaultLoyaltyData() {
  // 1. Seed Tiers
  let tierCount = await Tier.countDocuments();
  if (tierCount === 0) {
    const defaultTiers = [
      { name: "Beginner", key: "beginner", colorIdentity: "#8E8E93", badgeUrl: "badge_beginner", rank: 0 },
      { name: "Bronze", key: "bronze", colorIdentity: "#CD7F32", badgeUrl: "badge_bronze", rank: 1 },
      { name: "Silver", key: "silver", colorIdentity: "#C0C0C0", badgeUrl: "badge_silver", rank: 2 },
      { name: "Gold", key: "gold", colorIdentity: "#FFD700", badgeUrl: "badge_gold", rank: 3 },
      { name: "Platinum", key: "platinum", colorIdentity: "#E5E4E2", badgeUrl: "badge_platinum", rank: 4 },
    ];
    await Tier.create(defaultTiers);
    console.log("🌱 Default loyalty tiers successfully seeded.");
  }

  // 2. Seed active Season
  let seasonCount = await LoyaltySeason.countDocuments();
  let activeSeason = await LoyaltySeason.findOne({ active: true });
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
    });
    console.log("🌱 Active Default Loyalty Season successfully seeded.");
  }

  // 3. Seed Tier Configurations for this Season
  let configCount = await TierConfiguration.countDocuments({ seasonId: activeSeason._id });
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
      const template = configTemplates[tier.key] || { threshold: 0, multiplier: 1.0 };
      configurations.push({
        tierId: tier._id,
        seasonId: activeSeason._id,
        qualificationThreshold: template.threshold,
        pointMultiplier: template.multiplier,
        active: true,
      });
    }
    await TierConfiguration.create(configurations);
    console.log("🌱 Default loyalty configurations successfully seeded.");
  }

  return activeSeason;
}

/**
 * Returns or creates the user's progress document for the active season.
 */
async function getOrCreateUserProgress(userId, seasonId = null) {
  let activeSeason;
  if (seasonId) {
    activeSeason = await LoyaltySeason.findById(seasonId);
  } else {
    activeSeason = await LoyaltySeason.findOne({ active: true });
  }

  if (!activeSeason) {
    activeSeason = await seedDefaultLoyaltyData();
  }

  let progress = await UserTierProgress.findOne({ userId, seasonId: activeSeason._id })
    .populate("currentTierId")
    .exec();

  if (!progress) {
    const beginnerTier = await Tier.findOne({ rank: 0 });
    if (!beginnerTier) {
      await seedDefaultLoyaltyData();
      return getOrCreateUserProgress(userId, activeSeason._id);
    }

    progress = await UserTierProgress.create({
      userId,
      seasonId: activeSeason._id,
      currentTierId: beginnerTier._id,
      qualificationPoints: 0,
    });

    // Update cached tier in User record
    await User.findByIdAndUpdate(userId, { currentTierId: beginnerTier._id });

    progress = await UserTierProgress.findById(progress._id).populate("currentTierId").exec();
  }

  return progress;
}

/**
 * Processes qualification and redeemable points award on scan.
 */
async function processQrScanPoints(userId, points, referenceId) {
  const activeSeason = await LoyaltySeason.findOne({ active: true });
  if (!activeSeason) {
    await seedDefaultLoyaltyData();
  }

  const progress = await getOrCreateUserProgress(userId);

  // 1. Log transaction
  await LoyaltyTransaction.create({
    userId,
    seasonId: progress.seasonId,
    points,
    type: "BOTH",
    source: "QR_SCAN",
    description: `QR Code scan points addition`,
    referenceId,
  });

  // 2. Increment user QP
  progress.qualificationPoints += points;
  progress.lastEvaluatedAt = new Date();
  await progress.save();

  // 3. Evaluate dynamic upgrades
  const updatedProgress = await evaluateTierUpgrade(userId, progress.seasonId);

  return updatedProgress;
}

/**
 * Awards campaign points affecting ONLY redeemable balance (no tier impact).
 */
async function addBonusPoints(userId, points, description, referenceId = null) {
  const user = await User.findById(userId);
  if (!user) sendFailResponse("User not found");

  const activeSeason = await LoyaltySeason.findOne({ active: true });

  // 1. Log transaction
  await LoyaltyTransaction.create({
    userId,
    seasonId: activeSeason?._id || null,
    points,
    type: "REDEEMABLE",
    source: "CAMPAIGN_BONUS",
    description: description || "Bonus points reward",
    referenceId,
  });

  // 2. Add to user totalPoints
  user.totalPoints += points;
  await user.save();

  return { message: "Bonus points successfully added", points };
}

/**
 * Evaluates points and performs automatic tier upgrades.
 */
async function evaluateTierUpgrade(userId, seasonId) {
  const progress = await UserTierProgress.findOne({ userId, seasonId }).populate("currentTierId");
  if (!progress) return null;

  // Get active configurations for the season
  const configs = await TierConfiguration.find({ seasonId, active: true })
    .populate("tierId")
    .lean();

  if (configs.length === 0) return progress;

  // Sort by threshold DESC to evaluate highest qualification first
  const sortedConfigs = configs.sort((a, b) => {
    return b.qualificationThreshold - a.qualificationThreshold;
  });

  let qualifiedConfig = null;
  for (const config of sortedConfigs) {
    if (progress.qualificationPoints >= config.qualificationThreshold) {
      qualifiedConfig = config;
      break;
    }
  }

  // If we found a qualified tier config and it is a higher rank than the current tier
  if (qualifiedConfig && qualifiedConfig.tierId.rank > (progress.currentTierId?.rank || 0)) {
    const oldTierName = progress.currentTierId?.name || "None";
    const newTier = qualifiedConfig.tierId;

    // Perform upgrade
    progress.currentTierId = newTier._id;
    progress.lastEvaluatedAt = new Date();
    await progress.save();

    // Cache current tier in User record
    const user = await User.findById(userId);
    if (user) {
      user.currentTierId = newTier._id;
      await user.save();

      // Dispatch FCM Push Notification
      if (user.fcmTokens?.length && user.enableNotification) {
        try {
          await sendFcmNotifications(
            user.fcmTokens,
            "Tier Upgraded! 🎉",
            `Awesome! You've been upgraded from ${oldTierName} to ${newTier.name} tier! 🚀`
          );
        } catch (error) {
          console.error("⚠️ Failed to send tier upgrade FCM notification:", error);
        }
      }
    }

    // Return newly populated progress
    return UserTierProgress.findById(progress._id).populate("currentTierId").exec();
  }

  return progress;
}

/**
 * Formulate loyalty summary report.
 */
async function getUserLoyaltySummary(userId) {
  const activeSeason = await LoyaltySeason.findOne({ active: true });
  if (!activeSeason) {
    await seedDefaultLoyaltyData();
  }

  const progress = await getOrCreateUserProgress(userId);
  const currentTier = progress.currentTierId;
  const user = await User.findById(userId);

  // Find next tier config in active season
  const nextConfig = await TierConfiguration.findOne({
    seasonId: progress.seasonId,
    active: true,
    qualificationThreshold: { $gt: progress.qualificationPoints },
  })
    .populate({
      path: "tierId",
      match: { rank: { $gt: currentTier?.rank || 0 } }
    })
    .sort({ qualificationThreshold: 1 })
    .lean();

  // Filter if the populated tierId matched or not
  let nextTier = null;
  let remainingPoints = 0;
  let progressPercentage = 100;

  if (nextConfig && nextConfig.tierId) {
    nextTier = nextConfig.tierId;
    remainingPoints = nextConfig.qualificationThreshold - progress.qualificationPoints;

    const currentThreshold = currentTier
      ? await TierConfiguration.findOne({ seasonId: progress.seasonId, tierId: currentTier._id })
          .select("qualificationThreshold")
          .lean()
      : null;

    const startPoints = currentThreshold ? currentThreshold.qualificationThreshold : 0;
    const targetPoints = nextConfig.qualificationThreshold;
    const denominator = targetPoints - startPoints;

    if (denominator > 0) {
      progressPercentage = Math.round(
        ((progress.qualificationPoints - startPoints) / denominator) * 100
      );
      progressPercentage = Math.max(0, Math.min(100, progressPercentage));
    } else {
      progressPercentage = 0;
    }
  }

  // Get current active config multiplier
  const activeConfig = await TierConfiguration.findOne({
    seasonId: progress.seasonId,
    tierId: currentTier?._id,
  }).lean();

  return {
    currentTier: {
      id: currentTier?._id,
      name: currentTier?.name || "Beginner",
      key: currentTier?.key || "beginner",
      colorIdentity: currentTier?.colorIdentity || "#8E8E93",
      badgeUrl: currentTier?.badgeUrl || "",
      pointMultiplier: activeConfig?.pointMultiplier || 1.0,
    },
    nextTier: nextTier ? {
      id: nextTier._id,
      name: nextTier.name,
      badgeUrl: nextTier.badgeUrl,
      threshold: nextConfig.qualificationThreshold,
    } : null,
    qualificationPoints: progress.qualificationPoints,
    remainingPoints,
    progressPercentage,
    redeemableBalance: user?.totalPoints || 0,
    activeSeason: {
      id: progress.seasonId,
      name: activeSeason?.name || "Default Season",
      code: activeSeason?.code || "DEFAULT",
      endDate: activeSeason?.endDate,
    },
  };
}

/**
 * Retrieves all active tier configurations for the active season,
 * populated with their respective tier details, sorted by tier rank.
 */
async function getMobileTiersList() {
  let activeSeason = await LoyaltySeason.findOne({ active: true });
  if (!activeSeason) {
    activeSeason = await seedDefaultLoyaltyData();
  }

  const configs = await TierConfiguration.find({
    seasonId: activeSeason._id,
    active: true,
  })
    .populate("tierId")
    .populate("benefits")
    .exec();

  // Filter out any configs where the tierId is not found (or inactive)
  const validConfigs = configs.filter(config => config.tierId && config.tierId.active !== false);

  // Sort by tier rank ASC
  validConfigs.sort((a, b) => (a.tierId.rank || 0) - (b.tierId.rank || 0));

  // Map to a clean response format suitable for the mobile app
  return validConfigs.map(config => {
    const tier = config.tierId;
    return {
      id: tier._id,
      name: tier.name,
      key: tier.key,
      colorIdentity: tier.colorIdentity,
      badgeUrl: tier.badgeUrl,
      rank: tier.rank,
      qualificationThreshold: config.qualificationThreshold,
      pointMultiplier: config.pointMultiplier,
      benefits: (config.benefits || []).map(benefit => ({
        id: benefit._id,
        name: benefit.name,
        description: benefit.description,
        key: benefit.key,
        active: benefit.active,
      })),
    };
  });
}

module.exports = {
  seedDefaultLoyaltyData,
  getOrCreateUserProgress,
  processQrScanPoints,
  addBonusPoints,
  evaluateTierUpgrade,
  getUserLoyaltySummary,
  getMobileTiersList,
};


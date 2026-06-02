const Tier = require("../../schemas/tier.schema");
const LoyaltySeason = require("../../schemas/loyalty-season.schema");
const TierBenefit = require("../../schemas/tier-benefit.schema");
const TierConfiguration = require("../../schemas/tier-configuration.schema");
const TierConfigurationHistory = require("../../schemas/tier-configuration-history.schema");
const LoyaltyConfigAuditLog = require("../../schemas/loyalty-config-audit.schema");
const UserTierProgress = require("../../schemas/user-tier-progress.schema");
const LoyaltyTransaction = require("../../schemas/loyalty-transaction.schema");
const User = require("../../schemas/user.schema");
const { sendFcmNotifications } = require("../../functions/fcm");
const { sendFailResponse } = require("../../utils/responseHandlers");
const {
  logConfigurationAudit,
  buildChanges,
  createTierConfigHistorySnapshot,
} = require("./loyalty-audit.service");

function normalizeDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    sendFailResponse("Invalid season date range");
  }
  if (start > end) {
    sendFailResponse("Season startDate must be before or equal to endDate");
  }
  return { start, end };
}

async function ensureSeasonDateRangeHasNoOverlap({ startDate, endDate, excludeSeasonId = null }) {
  const overlapQuery = {
    isArchived: { $ne: true },
    _id: excludeSeasonId ? { $ne: excludeSeasonId } : { $exists: true },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };
  const overlappingSeason = await LoyaltySeason.findOne(overlapQuery).lean();
  if (overlappingSeason) {
    sendFailResponse("Season date range overlaps with an existing season");
  }
}

async function resolveActiveSeason(referenceDate = new Date()) {
  const now = new Date(referenceDate);
  const dateMatchedSeason = await LoyaltySeason.findOne({
    isArchived: { $ne: true },
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  if (!dateMatchedSeason) {
    return null;
  }

  if (!dateMatchedSeason.active) {
    await LoyaltySeason.updateMany(
      { _id: { $ne: dateMatchedSeason._id }, active: true },
      { active: false, deactivatedAt: now },
    );
    await LoyaltySeason.findByIdAndUpdate(dateMatchedSeason._id, {
      active: true,
      activatedAt: now,
      deactivatedAt: null,
    });
  }

  return LoyaltySeason.findById(dateMatchedSeason._id);
}

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
    activeSeason = await resolveActiveSeason();
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
  const activeSeason = await resolveActiveSeason();
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

  const activeSeason = await resolveActiveSeason();

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
  const configs = await TierConfiguration.find({ seasonId, active: true, isArchived: { $ne: true } })
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
  const activeSeason = await resolveActiveSeason();
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
    isArchived: { $ne: true },
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
      ? await TierConfiguration.findOne({
          seasonId: progress.seasonId,
          tierId: currentTier._id,
          isArchived: { $ne: true },
        })
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
    isArchived: { $ne: true },
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

async function createSeason(adminId, payload) {
  const { name, code, startDate, endDate, active = false } = payload;
  const { start, end } = normalizeDateRange(startDate, endDate);
  await ensureSeasonDateRangeHasNoOverlap({ startDate: start, endDate: end });

  if (active) {
    await LoyaltySeason.updateMany({ active: true }, { active: false, deactivatedAt: new Date() });
  }

  const season = await LoyaltySeason.create({
    ...payload,
    name,
    code,
    startDate: start,
    endDate: end,
    active,
    activatedAt: active ? new Date() : null,
    deactivatedAt: null,
  });

  await logConfigurationAudit({
    action: "SEASON_CREATED",
    changedBy: adminId,
    seasonId: season._id,
    seasonName: season.name,
    changes: buildChanges({}, season.toObject(), [
      "name",
      "code",
      "startDate",
      "endDate",
      "active",
      "carryForwardBehavior",
      "carryForwardPercentage",
    ]),
  });

  return season;
}

async function updateSeason(adminId, seasonId, payload) {
  let existingSeason = await LoyaltySeason.findById(seasonId);
  if (!existingSeason) {
    const fallbackUpdated = await LoyaltySeason.findByIdAndUpdate(seasonId, payload, { new: true });
    if (fallbackUpdated) {
      return fallbackUpdated;
    }
  }
  if (!existingSeason) {
    sendFailResponse("Season not found", 404);
  }

  const nextData = { ...payload };
  if (payload.startDate || payload.endDate) {
    const { start, end } = normalizeDateRange(
      payload.startDate || existingSeason.startDate,
      payload.endDate || existingSeason.endDate,
    );
    nextData.startDate = start;
    nextData.endDate = end;
    await ensureSeasonDateRangeHasNoOverlap({
      startDate: start,
      endDate: end,
      excludeSeasonId: seasonId,
    });
  }

  if (payload.active === true) {
    await LoyaltySeason.updateMany({ _id: { $ne: seasonId }, active: true }, { active: false, deactivatedAt: new Date() });
    nextData.activatedAt = new Date();
    nextData.deactivatedAt = null;
  }

  if (payload.active === false) {
    const activeCount = await LoyaltySeason.countDocuments({ active: true });
    if (existingSeason.active && activeCount <= 1) {
      sendFailResponse("At least one season must remain active");
    }
    nextData.deactivatedAt = new Date();
  }

  const updatedSeason = await LoyaltySeason.findByIdAndUpdate(seasonId, nextData, { new: true });
  const changes = buildChanges(existingSeason.toObject(), updatedSeason.toObject(), [
    "name",
    "code",
    "startDate",
    "endDate",
    "active",
    "carryForwardBehavior",
    "carryForwardPercentage",
  ]);

  if (changes.length) {
    await logConfigurationAudit({
      action: "SEASON_UPDATED",
      changedBy: adminId,
      seasonId: updatedSeason._id,
      seasonName: updatedSeason.name,
      changes,
    });
  }

  return updatedSeason;
}

async function activateSeason(adminId, seasonId) {
  const season = await LoyaltySeason.findById(seasonId);
  if (!season) {
    sendFailResponse("Season not found", 404);
  }

  await LoyaltySeason.updateMany({ _id: { $ne: seasonId }, active: true }, { active: false, deactivatedAt: new Date() });
  const activeSeason = await LoyaltySeason.findByIdAndUpdate(
    seasonId,
    { active: true, activatedAt: new Date(), deactivatedAt: null },
    { new: true },
  );

  await logConfigurationAudit({
    action: "SEASON_ACTIVATED",
    changedBy: adminId,
    seasonId: activeSeason._id,
    seasonName: activeSeason.name,
    changes: [{ field: "active", oldValue: false, newValue: true }],
  });

  return activeSeason;
}

async function deactivateSeason(adminId, seasonId) {
  const season = await LoyaltySeason.findById(seasonId);
  if (!season) {
    sendFailResponse("Season not found", 404);
  }
  if (!season.active) {
    return season;
  }

  const now = new Date();
  const activeCount = await LoyaltySeason.countDocuments({ active: true, isArchived: { $ne: true } });
  const deactivated = await LoyaltySeason.findByIdAndUpdate(
    seasonId,
    { active: false, deactivatedAt: now },
    { new: true },
  );

  // If this was the last active season, automatically promote a fallback season.
  if (activeCount <= 1) {
    let fallbackSeason = await LoyaltySeason.findOne({
      _id: { $ne: seasonId },
      isArchived: { $ne: true },
      startDate: { $lte: now },
      endDate: { $gte: now },
    });

    if (!fallbackSeason) {
      fallbackSeason = await LoyaltySeason.findOne({
        _id: { $ne: seasonId },
        isArchived: { $ne: true },
      }).sort({ startDate: 1 });
    }

    if (!fallbackSeason) {
      sendFailResponse("Cannot deactivate the only available season");
    }

    await LoyaltySeason.findByIdAndUpdate(fallbackSeason._id, {
      active: true,
      activatedAt: now,
      deactivatedAt: null,
    });

    await logConfigurationAudit({
      action: "SEASON_ACTIVATED",
      changedBy: adminId,
      seasonId: fallbackSeason._id,
      seasonName: fallbackSeason.name,
      changes: [{ field: "active", oldValue: false, newValue: true }],
      metadata: { reason: "AUTO_ACTIVATED_ON_DEACTIVATE" },
    });
  }

  await logConfigurationAudit({
    action: "SEASON_DEACTIVATED",
    changedBy: adminId,
    seasonId: deactivated._id,
    seasonName: deactivated.name,
    changes: [{ field: "active", oldValue: true, newValue: false }],
  });

  return deactivated;
}

async function createTierConfiguration(adminId, payload) {
  const season = await LoyaltySeason.findById(payload.seasonId).lean();
  if (!season || season.isArchived) {
    sendFailResponse("Season not found", 404);
  }

  const tier = await Tier.findById(payload.tierId).lean();
  if (!tier) {
    sendFailResponse("Tier not found", 404);
  }

  const config = await TierConfiguration.create(payload);
  await createTierConfigHistorySnapshot({ configDoc: config, changedBy: adminId });

  await logConfigurationAudit({
    action: "TIER_CONFIG_CREATED",
    changedBy: adminId,
    seasonId: config.seasonId,
    tierId: config.tierId,
    tierConfigurationId: config._id,
    seasonName: season.name,
    tierName: tier.name,
    changes: buildChanges({}, config.toObject(), [
      "qualificationThreshold",
      "pointMultiplier",
      "benefits",
      "active",
      "metadata",
    ]),
  });

  return config;
}

async function updateTierConfiguration(adminId, configId, payload) {
  const existing = await TierConfiguration.findById(configId).populate("tierId").populate("seasonId");
  if (!existing) {
    sendFailResponse("Tier configuration not found", 404);
  }

  const updated = await TierConfiguration.findByIdAndUpdate(configId, payload, { new: true });
  const changes = buildChanges(existing.toObject(), updated.toObject(), [
    "qualificationThreshold",
    "pointMultiplier",
    "benefits",
    "active",
    "metadata",
  ]);

  if (changes.length) {
    await createTierConfigHistorySnapshot({ configDoc: updated, changedBy: adminId });
    await logConfigurationAudit({
      action: "TIER_CONFIG_UPDATED",
      changedBy: adminId,
      seasonId: updated.seasonId,
      tierId: updated.tierId,
      tierConfigurationId: updated._id,
      seasonName: existing?.seasonId?.name || null,
      tierName: existing?.tierId?.name || null,
      changes,
    });
  }

  return updated;
}

async function archiveSeason(adminId, seasonId) {
  const season = await LoyaltySeason.findById(seasonId);
  if (!season) {
    const fallbackArchived = await LoyaltySeason.findByIdAndUpdate(
      seasonId,
      { isArchived: true, active: false, deactivatedAt: new Date() },
      { new: true },
    );
    if (fallbackArchived) {
      return fallbackArchived;
    }
    sendFailResponse("Season not found", 404);
  }

  const archived = await LoyaltySeason.findByIdAndUpdate(
    seasonId,
    { isArchived: true, active: false, deactivatedAt: new Date() },
    { new: true },
  );

  await logConfigurationAudit({
    action: "SEASON_DELETED",
    changedBy: adminId,
    seasonId: archived._id,
    seasonName: archived.name,
    changes: [{ field: "isArchived", oldValue: false, newValue: true }],
  });

  return archived;
}

async function archiveTierConfiguration(adminId, configId) {
  const config = await TierConfiguration.findById(configId);
  if (!config) {
    const fallbackArchived = await TierConfiguration.findByIdAndUpdate(
      configId,
      { isArchived: true, active: false },
      { new: true },
    );
    if (fallbackArchived) {
      return fallbackArchived;
    }
    sendFailResponse("Tier configuration not found", 404);
  }

  const archived = await TierConfiguration.findByIdAndUpdate(
    configId,
    { isArchived: true, active: false },
    { new: true },
  );
  await createTierConfigHistorySnapshot({ configDoc: archived, changedBy: adminId });

  await logConfigurationAudit({
    action: "TIER_CONFIG_DELETED",
    changedBy: adminId,
    seasonId: archived.seasonId,
    tierId: archived.tierId,
    tierConfigurationId: archived._id,
    seasonName: null,
    tierName: null,
    changes: [{ field: "isArchived", oldValue: false, newValue: true }],
  });

  return archived;
}

async function getSeasonManagementSummary() {
  const activeSeason = await resolveActiveSeason();
  const seasons = await LoyaltySeason.find().sort({ startDate: -1 }).lean();
  const activeConfigs = activeSeason
    ? await TierConfiguration.find({ seasonId: activeSeason._id, active: true, isArchived: { $ne: true } })
        .populate("tierId")
        .lean()
    : [];

  return {
    activeSeason,
    seasons,
    activeTierConfigurations: activeConfigs,
  };
}

async function listConfigurationAuditLogs(query = {}) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const filters = {};
  if (query.seasonId) filters.seasonId = query.seasonId;
  if (query.tierId) filters.tierId = query.tierId;
  if (query.tierConfigurationId) filters.tierConfigurationId = query.tierConfigurationId;

  const [logs, total] = await Promise.all([
    LoyaltyConfigAuditLog.find(filters)
      .populate("changedBy", "name email")
      .populate("seasonId", "name code startDate endDate")
      .populate("tierId", "name key rank")
      .sort({ changedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    LoyaltyConfigAuditLog.countDocuments(filters),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getTierConfigurationHistory(configId) {
  return TierConfigurationHistory.find({ tierConfigurationId: configId })
    .populate("changedBy", "name email")
    .sort({ version: -1 })
    .lean();
}

module.exports = {
  seedDefaultLoyaltyData,
  getOrCreateUserProgress,
  processQrScanPoints,
  addBonusPoints,
  evaluateTierUpgrade,
  getUserLoyaltySummary,
  resolveActiveSeason,
  createSeason,
  updateSeason,
  activateSeason,
  deactivateSeason,
  createTierConfiguration,
  updateTierConfiguration,
  getSeasonManagementSummary,
  listConfigurationAuditLogs,
  getTierConfigurationHistory,
  archiveSeason,
  archiveTierConfiguration,
};

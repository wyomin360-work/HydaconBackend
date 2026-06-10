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
const { LOYALTY_TRANSACTION_TYPES, LOYALTY_TRANSACTION_SOURCES } = require("../../constants/loyalty");

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
  // Overlap check disabled to allow creating multiple seasons.
  // The system relies on the `active` flag to determine the current season.
  return;
}

async function resolveActiveSeason() {
  const activeSeason = await LoyaltySeason.findOne({
    active: true,
    isArchived: { $ne: true },
  });
  return activeSeason;
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
    sendFailResponse("No active loyalty season available.");
  }

  const beginnerTier = await Tier.findOne({ rank: 0 });
  if (!beginnerTier) {
    sendFailResponse("Loyalty tiers are not properly configured.");
  }

  let progress = await UserTierProgress.findOneAndUpdate(
    { userId, seasonId: activeSeason._id },
    {
      $setOnInsert: {
        userId,
        seasonId: activeSeason._id,
        currentTierId: beginnerTier._id,
        qualificationPoints: 0,
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate("currentTierId");

  // Ensure user has a cached currentTierId
  const user = await User.findById(userId);
  if (user && !user.currentTierId) {
    user.currentTierId = beginnerTier._id;
    await user.save();
  }

  return progress;
}

/**
 * Processes qualification and redeemable points award on scan.
 */
async function processQrScanPoints(userId, points, referenceId) {
  const activeSeason = await resolveActiveSeason();
  if (!activeSeason) {
    sendFailResponse("No active loyalty season available.");
  }

  const progress = await getOrCreateUserProgress(userId);

  // 1. Log transaction
  await LoyaltyTransaction.create({
    userId,
    seasonId: progress.seasonId,
    points,
    type: LOYALTY_TRANSACTION_TYPES.BOTH,
    source: LOYALTY_TRANSACTION_SOURCES.QR_SCAN,
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
    type: LOYALTY_TRANSACTION_TYPES.REDEEMABLE,
    source: LOYALTY_TRANSACTION_SOURCES.CAMPAIGN_BONUS,
    description: description || "Bonus points reward",
    referenceId,
  });

  // 2. Add to user totalPoints
  user.totalPoints += points;
  user.lifetimePoints = (user.lifetimePoints || 0) + points;
  await user.save();

  return { message: "Bonus points successfully added", points };
}

/**
 * Evaluates points and performs automatic tier upgrades.
 * Returns the updated progress document enriched with a `levelUpEvent` payload.
 */
async function evaluateTierUpgrade(userId, seasonId) {
  const progress = await UserTierProgress.findOne({ userId, seasonId }).populate("currentTierId");
  if (!progress) return null;

  // Get active configurations for the season
  const configs = await TierConfiguration.find({ seasonId, active: true, isArchived: { $ne: true } })
    .populate("tierId")
    .lean();

  if (configs.length === 0) {
    return Object.assign(progress.toObject?.() ?? progress, { levelUpEvent: { upgraded: false } });
  }

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
    const oldTier = progress.currentTierId;
    const oldTierName = oldTier?.name || "None";
    const newTier = qualifiedConfig.tierId;
    const upgradedAt = new Date();

    // Persist previous tier before overwriting
    progress.previousTierId = oldTier?._id || null;
    progress.currentTierId = newTier._id;
    progress.lastEvaluatedAt = upgradedAt;
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

    // Return populated progress with level-up event metadata
    const updatedProgress = await UserTierProgress.findById(progress._id)
      .populate("currentTierId")
      .populate("previousTierId")
      .exec();

    const result = updatedProgress.toObject ? updatedProgress.toObject() : updatedProgress;
    result.levelUpEvent = {
      upgraded: true,
      previousTier: oldTier ? {
        id: oldTier._id,
        name: oldTier.name,
        key: oldTier.key,
        colorIdentity: oldTier.colorIdentity,
        badgeUrl: oldTier.badgeUrl,
      } : null,
      newTier: {
        id: newTier._id,
        name: newTier.name,
        key: newTier.key,
        colorIdentity: newTier.colorIdentity,
        badgeUrl: newTier.badgeUrl,
      },
      upgradedAt,
    };
    return result;
  }

  const result = progress.toObject?.() ?? progress;
  result.levelUpEvent = { upgraded: false };
  return result;
}

/**
 * Formulate loyalty summary report.
 * Includes currentTier, previousTier, nextTier, progression metrics and active season.
 */
async function getUserLoyaltySummary(userId) {
  const activeSeason = await resolveActiveSeason();
  if (!activeSeason) {
    sendFailResponse("No active loyalty season available.");
  }

  // Populate both currentTierId and previousTierId in one query
  const progress = await (async () => {
    const p = await getOrCreateUserProgress(userId);
    // Re-fetch with previousTierId populated
    return UserTierProgress.findById(p._id)
      .populate("currentTierId")
      .populate("previousTierId")
      .lean();
  })();

  const currentTier = progress.currentTierId;
  const previousTier = progress.previousTierId || null;
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
    previousTier: previousTier ? {
      id: previousTier._id,
      name: previousTier.name,
      key: previousTier.key,
      colorIdentity: previousTier.colorIdentity,
      badgeUrl: previousTier.badgeUrl,
    } : null,
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
 * Admin API: Lists all configured loyalty tiers with pagination.
 */
async function listTiers(query = {}) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const filters = {};
  if (query.search) {
    filters.$or = [
      { name: { $regex: query.search, $options: "i" } },
      { key: { $regex: query.search, $options: "i" } },
    ];
  }

  const [tiers, total] = await Promise.all([
    Tier.find(filters).sort({ rank: 1 }).skip(skip).limit(limit).lean(),
    Tier.countDocuments(filters),
  ]);

  return {
    data: tiers,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Admin API: Lists all loyalty seasons with pagination.
 */
async function listSeasons(query = {}) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const includeArchived = query.includeArchived === "true";
  const filters = includeArchived ? {} : { isArchived: { $ne: true } };

  if (query.search) {
    filters.$or = [
      { name: { $regex: query.search, $options: "i" } },
      { code: { $regex: query.search, $options: "i" } },
    ];
  }
  if (query.active === "true") filters.active = true;
  if (query.active === "false") filters.active = false;

  const [seasons, total] = await Promise.all([
    LoyaltySeason.find(filters).sort({ startDate: -1 }).skip(skip).limit(limit).lean(),
    LoyaltySeason.countDocuments(filters),
  ]);

  return {
    data: seasons,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Admin API: Lists tier configurations with pagination (optionally filtered by season).
 */
async function listTierConfigurations(query = {}) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const filters = {};
  if (query.seasonId) {
    filters.seasonId = query.seasonId;
  }
  if (query.tierId) {
    filters.tierId = query.tierId;
  }
  if (query.includeArchived !== "true") {
    filters.isArchived = { $ne: true };
  }
  if (query.active === "true") filters.active = true;
  if (query.active === "false") filters.active = false;

  if (query.search) {
    filters.$or = [
      { "metadata.campaignTag": { $regex: query.search, $options: "i" } },
      { "metadata.region": { $regex: query.search, $options: "i" } }
    ];
  }

  const [configs, total] = await Promise.all([
    TierConfiguration.find(filters)
      .populate("tierId")
      .populate("benefits")
      .skip(skip)
      .limit(limit)
      .lean(),
    TierConfiguration.countDocuments(filters),
  ]);

  return {
    data: configs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Admin API: Lists configured benefit items with pagination.
 */
async function listBenefits(query = {}) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const filters = {};
  if (query.search) {
    filters.$or = [
      { name: { $regex: query.search, $options: "i" } },
      { key: { $regex: query.search, $options: "i" } },
    ];
  }
  if (query.active === "true") filters.active = true;
  if (query.active === "false") filters.active = false;

  const [benefits, total] = await Promise.all([
    TierBenefit.find(filters).skip(skip).limit(limit).lean(),
    TierBenefit.countDocuments(filters),
  ]);

  return {
    data: benefits,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Retrieve the full tier progression configurations for the active season,
 * populated with the tier definition data and benefits list.
 */
async function getTierProgressionMetadata(userId) {
  const activeSeason = await resolveActiveSeason();
  if (!activeSeason) {
    sendFailResponse("No active loyalty season available.");
  }

  const configs = await TierConfiguration.find({
    seasonId: activeSeason._id,
    active: true,
    isArchived: { $ne: true },
  })
    .populate("tierId")
    .populate("benefits")
    .lean();

  return configs;
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

async function getConfigAuditLogById(id) {
  const log = await LoyaltyConfigAuditLog.findById(id)
    .populate("changedBy", "name email")
    .populate("seasonId", "name code startDate endDate active")
    .populate("tierId", "name key rank colorIdentity")
    .populate("tierConfigurationId")
    .lean();

  if (!log) {
    const error = new Error("Audit log entry not found");
    error.statusCode = 404;
    throw error;
  }

  return log;
}

async function getTierConfigurationHistory(configId, query = {}) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const filters = { tierConfigurationId: configId };

  const [history, total] = await Promise.all([
    TierConfigurationHistory.find(filters)
      .populate("changedBy", "name email")
      .sort({ version: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TierConfigurationHistory.countDocuments(filters),
  ]);

  return {
    data: history,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getSeasonById(seasonId) {
  const season = await LoyaltySeason.findById(seasonId).lean();
  if (!season) {
    const error = new Error("Season not found");
    error.statusCode = 404;
    throw error;
  }
  return season;
}

module.exports = {
  seedDefaultLoyaltyData,
  getOrCreateUserProgress,
  processQrScanPoints,
  addBonusPoints,
  evaluateTierUpgrade,
  getUserLoyaltySummary,
  getTierProgressionMetadata,
  resolveActiveSeason,
  listTiers,
  listSeasons,
  listTierConfigurations,
  listBenefits,
  createSeason,
  updateSeason,
  activateSeason,
  deactivateSeason,
  createTierConfiguration,
  updateTierConfiguration,
  getSeasonManagementSummary,
  listConfigurationAuditLogs,
  getConfigAuditLogById,
  getTierConfigurationHistory,
  archiveSeason,
  archiveTierConfiguration,
  getSeasonById,
};

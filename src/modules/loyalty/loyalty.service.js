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
  logAudit,
  buildChanges,
} = require("../audit-log/audit-log.service");
const {
  createTierConfigHistorySnapshot,
} = require("./loyalty-audit.service");

async function logConfigurationAudit(payload) {
  return logAudit(payload.action, payload);
}
const {
  LOYALTY_TRANSACTION_TYPES,
  LOYALTY_TRANSACTION_SOURCES,
} = require("../../constants/loyalty");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const { formatNotification } = require("../../utils/heplers");

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

async function ensureSeasonDateRangeHasNoOverlap({
  startDate,
  endDate,
  excludeSeasonId = null,
}) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const query = {
    isArchived: { $ne: true },
    startDate: { $lte: end },
    endDate: { $gte: start },
  };

  if (excludeSeasonId) {
    query._id = { $ne: excludeSeasonId };
  }

  const overlappingSeason = await LoyaltySeason.findOne(query);
  if (overlappingSeason) {
    sendFailResponse(
      `Conflict: The season date range overlaps with an existing season "${overlappingSeason.name}".`
    );
  }
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
    return null;
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
        lastCelebratedTierId: beginnerTier._id,
        currentPoint: 0,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
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
    return null;
  }

  const progress = await getOrCreateUserProgress(userId);
  if (!progress) {
    return null;
  }

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

  // 2. Increment user QP atomically using $inc
  const updatedProgress = await UserTierProgress.findOneAndUpdate(
    { userId, seasonId: progress.seasonId },
    {
      $inc: { currentPoint: points },
      $set: { lastEvaluatedAt: new Date() },
    },
    { new: true }
  );

  if (!updatedProgress) {
    return null;
  }

  // 3. Evaluate dynamic upgrades
  await evaluateTierUpgrade(userId, progress.seasonId);

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

  // 2. Add to user totalPoints atomically using $inc
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $inc: { totalPoints: points, lifetimePoints: points },
    },
    { new: true }
  );

  // 3. Sync QP to ensure UserTierProgress.currentPoint >= updatedUser.totalPoints
  if (activeSeason) {
    const progress = await getOrCreateUserProgress(userId);
    if (progress && progress.currentPoint < updatedUser.totalPoints) {
      // Use atomic max update or direct set to sync the points
      await UserTierProgress.findOneAndUpdate(
        { userId, seasonId: activeSeason._id },
        {
          $max: { currentPoint: updatedUser.totalPoints },
          $set: { lastEvaluatedAt: new Date() },
        }
      );

      // Evaluate dynamic upgrades after modifying progress points
      await evaluateTierUpgrade(userId, activeSeason._id);
    }
  }

  return { message: "Bonus points successfully added", points };
}

/**
 * Evaluates points and performs automatic tier upgrades.
 * Returns the updated progress document enriched with a `levelUpEvent` payload.
 */
async function evaluateTierUpgrade(userId, seasonId) {
  const progress = await UserTierProgress.findOne({
    userId,
    seasonId,
  }).populate("currentTierId");
  if (!progress) return null;

  // Get active configurations for the season
  const configs = await TierConfiguration.find({
    seasonId,
    active: true,
    isArchived: { $ne: true },
  })
    .populate("tierId")
    .lean();

  if (configs.length === 0) {
    return Object.assign(progress.toObject?.() ?? progress, {
      levelUpEvent: { upgraded: false },
    });
  }

  // Sort by qualificationPoint DESC to evaluate highest qualification first
  const sortedConfigs = configs.sort((a, b) => {
    const valA = a.qualificationPoint ?? 0;
    const valB = b.qualificationPoint ?? 0;
    return valB - valA;
  });

  let qualifiedConfig = null;
  for (const config of sortedConfigs) {
    const thresholdVal = config.qualificationPoint ?? 0;
    if (progress.currentPoint >= thresholdVal) {
      qualifiedConfig = config;
      break;
    }
  }

  // If we found a qualified tier config and it is a higher rank than the current tier
  if (
    qualifiedConfig &&
    qualifiedConfig.tierId.rank > (progress.currentTierId?.rank || 0)
  ) {
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
            APP_NOTIFICATIONS.loyalty.tierUpgraded.title,
            formatNotification(APP_NOTIFICATIONS.loyalty.tierUpgraded.body, {
              oldTierName,
              newTierName: newTier.name,
            }),
          );
        } catch (error) {
          console.error(
            "⚠️ Failed to send tier upgrade FCM notification:",
            error,
          );
        }
      }
    }

    // Return populated progress with level-up event metadata
    const updatedProgress = await UserTierProgress.findById(progress._id)
      .populate("currentTierId")
      .populate("previousTierId")
      .exec();

    const result = updatedProgress.toObject
      ? updatedProgress.toObject()
      : updatedProgress;
    result.levelUpEvent = {
      upgraded: true,
      previousTier: oldTier
        ? {
            id: oldTier._id,
            name: oldTier.name,
            key: oldTier.key,
            colorIdentity: oldTier.colorIdentity,
            badgeUrl: oldTier.badgeUrl,
          }
        : null,
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
  const user = await User.findById(userId);
  if (!user) sendFailResponse("User not found");

  if (!activeSeason) {
    const beginnerTier = await Tier.findOne({ rank: 0 }).lean();
    return {
      currentTier: {
        id: beginnerTier?._id || "beginner",
        name: beginnerTier?.name || "Beginner",
        key: beginnerTier?.key || "beginner",
        colorIdentity: beginnerTier?.colorIdentity || "#8E8E93",
        badgeUrl: beginnerTier?.badgeUrl || "",
        pointMultiplier: 1.0,
        threshold: 0,
      },
      previousTier: null,
      nextTier: null,
      currentPoint: 0,
      remainingPoints: 0,
      progressPercentage: 0,
      redeemableBalance: user?.totalPoints || 0,
      activeSeason: null,
      levelUpEvent: { upgraded: false },
    };
  }

  // Populate currentTierId, previousTierId, and lastCelebratedTierId in one query
  const progressDoc = await getOrCreateUserProgress(userId);
  if (!progressDoc) {
    sendFailResponse("User progress not found");
  }
  let progress = await UserTierProgress.findById(progressDoc._id)
    .populate("currentTierId")
    .populate("previousTierId")
    .populate("lastCelebratedTierId")
    .lean();

  const currentTier = progress.currentTierId;
  const previousTier = progress.previousTierId || null;
  let lastCelebratedTier = progress.lastCelebratedTierId || null;

  // If lastCelebratedTierId is missing (legacy DB docs), initialize it to the current tier
  if (!progress.lastCelebratedTierId) {
    await UserTierProgress.findByIdAndUpdate(progress._id, {
      lastCelebratedTierId: currentTier?._id || null,
    });
    lastCelebratedTier = currentTier;
  }

  let levelUpEvent = { upgraded: false };
  const currentRank = currentTier?.rank ?? 0;
  const lastCelebratedRank = lastCelebratedTier?.rank ?? 0;

  if (currentRank > lastCelebratedRank) {
    levelUpEvent = {
      upgraded: true,
      previousTier: lastCelebratedTier
        ? {
            id: lastCelebratedTier._id,
            name: lastCelebratedTier.name,
            key: lastCelebratedTier.key,
            colorIdentity: lastCelebratedTier.colorIdentity,
            badgeUrl: lastCelebratedTier.badgeUrl,
          }
        : previousTier
          ? {
              id: previousTier._id,
              name: previousTier.name,
              key: previousTier.key,
              colorIdentity: previousTier.colorIdentity,
              badgeUrl: previousTier.badgeUrl,
            }
          : null,
      newTier: {
        id: currentTier._id,
        name: currentTier.name,
        key: currentTier.key,
        colorIdentity: currentTier.colorIdentity,
        badgeUrl: currentTier.badgeUrl,
      },
      upgradedAt: progress.updatedAt || new Date(),
    };

    // Mark as celebrated in DB so it won't show again on subsequent requests
    await UserTierProgress.findByIdAndUpdate(progress._id, {
      lastCelebratedTierId: currentTier._id,
    });
  }

  // Find next tier config in active season
  const nextConfig = await TierConfiguration.findOne({
    seasonId: progress.seasonId,
    active: true,
    isArchived: { $ne: true },
    qualificationPoint: { $gt: progress.currentPoint },
  })
    .populate({
      path: "tierId",
      match: { rank: { $gt: currentTier?.rank || 0 } },
    })
    .sort({ qualificationPoint: 1 })
    .lean();

  // Filter if the populated tierId matched or not
  let nextTier = null;
  let remainingPoints = 0;
  let progressPercentage = 100;

  if (nextConfig && nextConfig.tierId) {
    nextTier = nextConfig.tierId;
    remainingPoints =
      (nextConfig.qualificationPoint ?? 0) - progress.currentPoint;

    const currentThreshold = currentTier
      ? await TierConfiguration.findOne({
          seasonId: progress.seasonId,
          tierId: currentTier._id,
          isArchived: { $ne: true },
        })
          .select("qualificationPoint")
          .lean()
      : null;

    const startPoints = currentThreshold
      ? (currentThreshold.qualificationPoint ?? 0)
      : 0;
    const targetPoints = (nextConfig.qualificationPoint ?? 0) - 1;
    const denominator = targetPoints - startPoints;

    if (denominator > 0) {
      progressPercentage = Math.round(
        ((progress.currentPoint - startPoints) / denominator) * 100,
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
      threshold: activeConfig?.threshold ?? 0,
    },
    previousTier: previousTier
      ? {
          id: previousTier._id,
          name: previousTier.name,
          key: previousTier.key,
          colorIdentity: previousTier.colorIdentity,
          badgeUrl: previousTier.badgeUrl,
        }
      : null,
    nextTier: nextTier
      ? {
          id: nextTier._id,
          name: nextTier.name,
          badgeUrl: nextTier.badgeUrl,
          threshold: nextConfig.qualificationPoint ?? 0,
        }
      : null,
    currentPoint: progress.currentPoint,
    remainingPoints,
    progressPercentage,
    redeemableBalance: user?.totalPoints || 0,
    activeSeason: {
      id: progress.seasonId,
      name: activeSeason?.name || "Default Season",
      code: activeSeason?.code || "DEFAULT",
      endDate: activeSeason?.endDate,
    },
    levelUpEvent,
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
    LoyaltySeason.find(filters)
      .sort({ startDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
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
      { "metadata.region": { $regex: query.search, $options: "i" } },
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
    return [];
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
  const isNested =
    payload.seasonDetails !== undefined || payload.seasoDetaisl !== undefined;
  const details = isNested
    ? payload.seasonDetails || payload.seasoDetaisl
    : payload;
  const tierConfigs = isNested
    ? payload.tierConfigurations || payload.tierconfigurations || []
    : [];

  const { name, code, startDate, endDate, active = false } = details;
  const { start, end } = normalizeDateRange(startDate, endDate);
  await ensureSeasonDateRangeHasNoOverlap({ startDate: start, endDate: end });

  if (active) {
    await LoyaltySeason.updateMany(
      { active: true },
      { active: false, deactivatedAt: new Date() },
    );
  }

  const season = await LoyaltySeason.create({
    ...details,
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

  // Handle tier configurations if present
  let configsArray = Array.isArray(tierConfigs) ? tierConfigs : [];
  if (
    tierConfigs &&
    typeof tierConfigs === "object" &&
    !Array.isArray(tierConfigs)
  ) {
    configsArray = Object.entries(tierConfigs).map(([key, val]) => ({
      tierId: val.tierId || key,
      ...val,
    }));
  }

  if (configsArray.length > 0) {
    // Fetch tiers to sort configurations by rank ascending
    const allTiers = await Tier.find().lean();
    const tierMap = new Map(allTiers.map((t) => [t._id.toString(), t]));

    const sortedConfigs = [...configsArray].sort((a, b) => {
      const rankA = tierMap.get(a.tierId.toString())?.rank || 0;
      const rankB = tierMap.get(b.tierId.toString())?.rank || 0;
      return rankA - rankB;
    });

    for (const config of sortedConfigs) {
      await createTierConfiguration(adminId, {
        ...config,
        seasonId: season._id.toString(),
      });
    }
  }

  return season;
}

async function updateSeason(adminId, seasonId, payload) {
  let existingSeason = await LoyaltySeason.findById(seasonId);
  if (!existingSeason) {
    const fallbackUpdated = await LoyaltySeason.findByIdAndUpdate(
      seasonId,
      payload,
      { new: true },
    );
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
    await LoyaltySeason.updateMany(
      { _id: { $ne: seasonId }, active: true },
      { active: false, deactivatedAt: new Date() },
    );
    nextData.activatedAt = new Date();
    nextData.deactivatedAt = null;
  }

  if (payload.active === false) {
    nextData.deactivatedAt = new Date();
  }

  const updatedSeason = await LoyaltySeason.findByIdAndUpdate(
    seasonId,
    nextData,
    { new: true },
  );
  const changes = buildChanges(
    existingSeason.toObject(),
    updatedSeason.toObject(),
    [
      "name",
      "code",
      "startDate",
      "endDate",
      "active",
      "carryForwardBehavior",
      "carryForwardPercentage",
    ],
  );

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

  await LoyaltySeason.updateMany(
    { _id: { $ne: seasonId }, active: true },
    { active: false, deactivatedAt: new Date() },
  );
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
  const deactivated = await LoyaltySeason.findByIdAndUpdate(
    seasonId,
    { active: false, deactivatedAt: now },
    { new: true },
  );

  await logConfigurationAudit({
    action: "SEASON_DEACTIVATED",
    changedBy: adminId,
    seasonId: deactivated._id,
    seasonName: deactivated.name,
    changes: [{ field: "active", oldValue: true, newValue: false }],
  });

  return deactivated;
}

async function validateTierRange(payload, excludeTierId = null) {
  let active = payload.active;
  let qualificationPoint = payload.qualificationPoint;
  let threshold = payload.threshold;
  let rank = payload.rank;

  if (excludeTierId) {
    const existing = await Tier.findById(excludeTierId).lean();
    if (existing) {
      if (active === undefined) active = existing.active;
      if (qualificationPoint === undefined)
        qualificationPoint = existing.qualificationPoint;
      if (threshold === undefined) threshold = existing.threshold;
      if (rank === undefined) rank = existing.rank;
    }
  }

  if (active !== false) {
    const qp = Number(qualificationPoint || 0);
    const th = Number(threshold || 0);
    const currentRank = Number(rank || 0);

    if (qp < 0) {
      sendFailResponse("Qualification point must be a non-negative number");
    }
    if (th < 0) {
      sendFailResponse("Threshold must be a non-negative number");
    }

    const start = qp;
    const end = qp + th;

    const query = { active: true };
    if (excludeTierId) {
      query._id = { $ne: excludeTierId };
    }

    const activeTiers = await Tier.find(query).lean();

    for (const tier of activeTiers) {
      const tierQp = Number(tier.qualificationPoint || 0);
      const tierTh = Number(tier.threshold || 0);
      const tierStart = tierQp;
      const tierEnd = tierQp + tierTh;

      if (start < tierEnd && tierStart < end) {
        sendFailResponse(
          `Conflict detected: The active range [${start}, ${end}) overlaps with existing active tier "${tier.name}" [${tierStart}, ${tierEnd}).`,
        );
      }

      if (tier.rank < currentRank) {
        if (tierQp >= qp) {
          sendFailResponse(
            `Qualification point conflicts with lower rank tier "${tier.name}" (QP: ${tierQp}). Qualification points must be strictly ascending with rank.`,
          );
        }
      }

      if (tier.rank > currentRank) {
        if (tierQp <= qp) {
          sendFailResponse(
            `Qualification point conflicts with higher rank tier "${tier.name}" (QP: ${tierQp}). Qualification points must be strictly ascending with rank.`,
          );
        }
      }
    }
  }
}

async function recalculateTierConfigurationThresholds(seasonId) {
  const query = TierConfiguration.find({
    seasonId,
    active: true,
    isArchived: { $ne: true },
  }).populate("tierId");

  const configs =
    typeof query.lean === "function" ? await query.lean() : await query;

  if (configs.length === 0) return;

  const sortedConfigs = configs
    .filter((c) => c.tierId)
    .sort((a, b) => a.tierId.rank - b.tierId.rank);

  const highestRankConfig = sortedConfigs[sortedConfigs.length - 1];

  for (let i = 0; i < sortedConfigs.length; i++) {
    const config = sortedConfigs[i];
    const isFinal = i === sortedConfigs.length - 1;

    if (config.isFinalTier !== isFinal) {
      config.isFinalTier = isFinal;
      await TierConfiguration.findByIdAndUpdate(config._id, {
        isFinalTier: isFinal,
      });
    }

    if (isFinal) {
      continue;
    }

    if (i < sortedConfigs.length - 1) {
      const nextConfig = sortedConfigs[i + 1];
      const calculatedThreshold =
        nextConfig.qualificationPoint - config.qualificationPoint;

      await TierConfiguration.findByIdAndUpdate(config._id, {
        threshold: calculatedThreshold,
      });
    }
  }
}

async function validateTierConfigurationThreshold(
  seasonId,
  tierId,
  newQp,
  isActive,
  excludeConfigId = null,
) {
  if (isActive === false) return; // Inactive configs don't conflict

  const season = await LoyaltySeason.findById(seasonId).lean();
  if (season) {
    const currentTier = await Tier.findById(tierId).lean();
    if (!currentTier) return;

    const allConfigs = await TierConfiguration.find({
      seasonId,
      active: true,
      isArchived: { $ne: true },
      _id: { $ne: excludeConfigId },
    }).populate("tierId");

    const start = Number(newQp || 0);

    for (const config of allConfigs) {
      if (!config.tierId) continue;

      if (config.tierId.rank < currentTier.rank) {
        if (config.qualificationPoint >= start) {
          sendFailResponse(
            `Qualification point conflicts with lower rank tier "${config.tierId.name}" (QP: ${config.qualificationPoint}). Qualification points must be strictly ascending with rank.`,
          );
        }
      }

      if (config.tierId.rank > currentTier.rank) {
        if (config.qualificationPoint <= start) {
          sendFailResponse(
            `Qualification point conflicts with higher rank tier "${config.tierId.name}" (QP: ${config.qualificationPoint}). Qualification points must be strictly ascending with rank.`,
          );
        }
      }
    }
  }
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

  // Set default values if not defined in payload
  const qp =
    payload.qualificationPoint !== undefined
      ? payload.qualificationPoint
      : tier.qualificationPoint || 0;
  const th =
    payload.threshold !== undefined ? payload.threshold : tier.threshold || 0;

  payload.qualificationPoint = qp;
  payload.threshold = th;

  await validateTierConfigurationThreshold(
    payload.seasonId,
    payload.tierId,
    qp,
    payload.active !== false,
  );

  const config = await TierConfiguration.create(payload);
  await recalculateTierConfigurationThresholds(config.seasonId);
  await createTierConfigHistorySnapshot({
    configDoc: config,
    changedBy: adminId,
  });

  await logConfigurationAudit({
    action: "TIER_CONFIG_CREATED",
    changedBy: adminId,
    seasonId: config.seasonId,
    tierId: config.tierId,
    tierConfigurationId: config._id,
    seasonName: season.name,
    tierName: tier.name,
    changes: buildChanges({}, config.toObject(), [
      "qualificationPoint",
      "threshold",
      "pointMultiplier",
      "benefits",
      "active",
      "isFinalTier",
      "metadata",
    ]),
  });

  return config;
}

async function recalculateSeasonTiers(seasonId) {
  const configs = await TierConfiguration.find({
    seasonId,
    active: true,
    isArchived: { $ne: true },
  })
    .populate("tierId")
    .lean();

  if (configs.length === 0) return;

  const sortedConfigs = configs.sort(
    (a, b) => (b.qualificationPoint ?? 0) - (a.qualificationPoint ?? 0),
  );
  const rankZeroConfig = configs.find((c) => c.tierId && c.tierId.rank === 0);

  const progresses = await UserTierProgress.find({ seasonId }).populate(
    "currentTierId",
  );

  const progressBulkOps = [];
  const userBulkOps = [];
  const notificationsToSend = [];

  for (const progress of progresses) {
    let qualifiedConfig = null;
    for (const config of sortedConfigs) {
      if (progress.currentPoint >= (config.qualificationPoint ?? 0)) {
        qualifiedConfig = config;
        break;
      }
    }

    if (!qualifiedConfig && rankZeroConfig) {
      qualifiedConfig = rankZeroConfig;
    }

    if (qualifiedConfig && qualifiedConfig.tierId) {
      const oldTier = progress.currentTierId;
      const newTier = qualifiedConfig.tierId;

      if (!oldTier || String(oldTier._id) !== String(newTier._id)) {
        const oldTierName = oldTier?.name || "None";
        const oldRank = oldTier?.rank || 0;
        const newRank = newTier.rank || 0;
        const isUpgrade = newRank > oldRank;
        const lastEvaluatedAt = new Date();

        progressBulkOps.push({
          updateOne: {
            filter: { _id: progress._id },
            update: {
              $set: {
                previousTierId: oldTier?._id || null,
                currentTierId: newTier._id,
                lastEvaluatedAt,
              },
            },
          },
        });

        userBulkOps.push({
          updateOne: {
            filter: { _id: progress.userId },
            update: {
              $set: {
                currentTierId: newTier._id,
              },
            },
          },
        });

        notificationsToSend.push({
          userId: progress.userId,
          oldTierName,
          newTierName: newTier.name,
          isUpgrade,
        });
      }
    }
  }

  if (progressBulkOps.length > 0) {
    await Promise.all([
      UserTierProgress.bulkWrite(progressBulkOps),
      User.bulkWrite(userBulkOps),
    ]);

    const affectedUserIds = notificationsToSend.map((n) => n.userId);
    const users = await User.find({ _id: { $in: affectedUserIds } })
      .select("fcmTokens enableNotification")
      .lean();

    const userMap = new Map(users.map((u) => [String(u._id), u]));

    for (const notif of notificationsToSend) {
      const user = userMap.get(String(notif.userId));
      if (user && user.fcmTokens?.length && user.enableNotification) {
        const notifTemplate = notif.isUpgrade
          ? APP_NOTIFICATIONS.loyalty.tierUpgraded
          : APP_NOTIFICATIONS.loyalty.tierUpdated;

        const title = notifTemplate.title;
        const body = formatNotification(notifTemplate.body, {
          oldTierName: notif.oldTierName,
          newTierName: notif.newTierName,
        });

        sendFcmNotifications(user.fcmTokens, title, body).catch((error) => {
          console.error(
            "⚠️ Failed to send tier adjustment FCM notification:",
            error,
          );
        });
      }
    }
  }
}

async function updateTierConfiguration(adminId, configId, payload) {
  const existing = await TierConfiguration.findById(configId)
    .populate("tierId")
    .populate("seasonId");
  if (!existing) {
    sendFailResponse("Tier configuration not found", 404);
  }

  const qp =
    payload.qualificationPoint !== undefined
      ? payload.qualificationPoint
      : existing.qualificationPoint;
  const th =
    payload.threshold !== undefined ? payload.threshold : existing.threshold;
  const active =
    payload.active !== undefined ? payload.active : existing.active;

  if (
    payload.qualificationPoint !== undefined ||
    payload.active !== undefined
  ) {
    payload.qualificationPoint = qp;
    payload.threshold = th;
    await validateTierConfigurationThreshold(
      existing.seasonId._id || existing.seasonId,
      existing.tierId._id || existing.tierId,
      qp,
      active,
      configId,
    );
  }

  const updated = await TierConfiguration.findByIdAndUpdate(configId, payload, {
    new: true,
  });
  await recalculateTierConfigurationThresholds(
    existing.seasonId._id || existing.seasonId.id || existing.seasonId,
  );
  const changes = buildChanges(existing.toObject(), updated.toObject(), [
    "qualificationPoint",
    "threshold",
    "pointMultiplier",
    "benefits",
    "active",
    "isFinalTier",
    "metadata",
  ]);

  if (changes.length) {
    await createTierConfigHistorySnapshot({
      configDoc: updated,
      changedBy: adminId,
    });
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

    const thresholdChanged = changes.some(
      (c) => c.field === "qualificationPoint" || c.field === "threshold",
    );
    if (thresholdChanged && existing.seasonId && existing.seasonId.active) {
      await recalculateSeasonTiers(
        existing.seasonId._id || existing.seasonId.id || existing.seasonId,
      );
    }
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
  await recalculateTierConfigurationThresholds(archived.seasonId);
  await createTierConfigHistorySnapshot({
    configDoc: archived,
    changedBy: adminId,
  });

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
    ? await TierConfiguration.find({
        seasonId: activeSeason._id,
        active: true,
        isArchived: { $ne: true },
      })
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
  if (query.tierConfigurationId)
    filters.tierConfigurationId = query.tierConfigurationId;

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
  validateTierRange,
};

const UserTierProgress = require("../../schemas/user-tier-progress.schema");
const User = require("../../schemas/user.schema");
const LoyaltyTransaction = require("../../schemas/loyalty-transaction.schema");
const Tier = require("../../schemas/tier.schema");
const TierConfiguration = require("../../schemas/tier-configuration.schema");
const LoyaltySeason = require("../../schemas/loyalty-season.schema");
const { sendFcmNotifications } = require("../../functions/fcm");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { resolveActiveSeason } = require("./loyalty-season.service");
const {
  LOYALTY_TRANSACTION_TYPES,
  LOYALTY_TRANSACTION_SOURCES,
} = require("../../constants/loyalty");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const { formatNotification } = require("../../utils/heplers");

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

  const beginnerTier = await Tier.findOne().sort({ rank: 1 });
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
    { new: true },
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
async function addBonusPoints(userId, points, description, referenceId = null, options = {}) {
  const user = await User.findById(userId);
  if (!user) sendFailResponse("User not found");

  const activeSeason = await resolveActiveSeason();

  // 1. Log transaction
  await LoyaltyTransaction.create({
    userId,
    seasonId: activeSeason?._id || null,
    points,
    type: LOYALTY_TRANSACTION_TYPES.REDEEMABLE,
    source: options.source || LOYALTY_TRANSACTION_SOURCES.CAMPAIGN_BONUS,
    description: description || "Bonus points reward",
    referenceId,
  });

  // 2. Add to user totalPoints atomically using $inc
  const incObj = { totalPoints: points };
  if (!options.skipLifetimePoints) {
    incObj.lifetimePoints = points;
  }
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $inc: incObj,
    },
    { new: true },
  );

  // 3. Sync QP to ensure UserTierProgress.currentPoint >= updatedUser.totalPoints
  if (activeSeason && !options.skipQpSync) {
    const progress = await getOrCreateUserProgress(userId);
    if (progress && progress.currentPoint < updatedUser.totalPoints) {
      // Use atomic max update or direct set to sync the points
      await UserTierProgress.findOneAndUpdate(
        { userId, seasonId: activeSeason._id },
        {
          $max: { currentPoint: updatedUser.totalPoints },
          $set: { lastEvaluatedAt: new Date() },
        },
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
    const oldTierName = oldTier?.name;
    const newTier = qualifiedConfig.tierId;
    const upgradedAt = new Date();

    // Persist previous tier before overwriting
    progress.previousTierId = oldTier?._id ?? null;
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
    const beginnerTier = await Tier.findOne().sort({ rank: 1 }).lean();
    return {
      currentTier: {
        id: beginnerTier?._id || "beginner",
        name: beginnerTier?.name || "Beginner",
        key: beginnerTier?.key || "beginner",
        colorIdentity: beginnerTier?.colorIdentity || "#8E8E93",
        badgeUrl: beginnerTier?.badgeUrl || "",
        pointMultiplier: 1.0,
        threshold: 0,
        qualificationPoint: 0,
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
      colorIdentity: currentTier?.colorIdentity,
      badgeUrl: currentTier?.badgeUrl || "",
      pointMultiplier: activeConfig?.pointMultiplier || 1.0,
      threshold: activeConfig?.threshold ?? 0,
      qualificationPoint: activeConfig?.qualificationPoint ?? 0,
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
          threshold: nextConfig.threshold ?? 0,
          qualificationPoint: nextConfig.qualificationPoint ?? 0,
          colorIdentity: nextConfig?.colorIdentity,
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
      bannerImages: activeSeason?.bannerImages ?? [],
    },
    levelUpEvent,
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

module.exports = {
  getOrCreateUserProgress,
  processQrScanPoints,
  addBonusPoints,
  evaluateTierUpgrade,
  getUserLoyaltySummary,
  getTierProgressionMetadata,
};

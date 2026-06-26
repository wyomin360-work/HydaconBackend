const Tier = require("../../schemas/tier.schema");
const LoyaltySeason = require("../../schemas/loyalty-season.schema");
const TierConfiguration = require("../../schemas/tier-configuration.schema");
const UserTierProgress = require("../../schemas/user-tier-progress.schema");
const User = require("../../schemas/user.schema");
const { sendFcmNotifications } = require("../../functions/fcm");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { logAudit, buildChanges } = require("../audit-log/audit-log.service");
const { createTierConfigHistorySnapshot } = require("./loyalty-audit.service");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const { formatNotification } = require("../../utils/heplers");

async function logConfigurationAudit(payload) {
  return logAudit(payload.action, payload);
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

module.exports = {
  listTiers,
  listTierConfigurations,
  validateTierRange,
  recalculateTierConfigurationThresholds,
  validateTierConfigurationThreshold,
  createTierConfiguration,
  recalculateSeasonTiers,
  updateTierConfiguration,
  archiveTierConfiguration,
};

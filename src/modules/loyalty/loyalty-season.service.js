const LoyaltySeason = require("../../schemas/loyalty-season.schema");
const Tier = require("../../schemas/tier.schema");
const TierConfiguration = require("../../schemas/tier-configuration.schema");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { logAudit, buildChanges } = require("../audit-log/audit-log.service");
const { createTierConfiguration } = require("./loyalty-tier.service");

async function logConfigurationAudit(payload) {
  return logAudit(payload.action, payload);
}

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
      `Conflict: The season date range overlaps with an existing season "${overlappingSeason.name}".`,
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
 * Creates a new loyalty season along with optional nested tier configurations.
 *
 * @param {string} adminId - The ID of the administrator creating the season.
 * @param {Object} payload - The payload object containing season and tier configuration details.
 * @returns {Promise<Object>} The created LoyaltySeason document.
 */
async function createSeason(adminId, payload = {}) {
  // Check for nested structure.
  // 'seasoDetaisl' is kept for backward compatibility with clients that sent a typoed payload key.
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

  const now = new Date();

  if (active) {
    await LoyaltySeason.updateMany(
      { active: true },
      { active: false, deactivatedAt: now },
    );
  }

  const season = await LoyaltySeason.create({
    ...details,
    name,
    code,
    startDate: start,
    endDate: end,
    active,
    activatedAt: active ? now : null,
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
  let configsArray = [];
  if (Array.isArray(tierConfigs)) {
    configsArray = tierConfigs;
  } else if (tierConfigs && typeof tierConfigs === "object") {
    configsArray = Object.entries(tierConfigs).map(([key, val]) => ({
      tierId: val?.tierId || key,
      ...val,
    }));
  }

  if (configsArray.length > 0) {
    // Fetch tiers to sort configurations by rank ascending
    const allTiers = await Tier.find().lean();
    const tierMap = new Map(allTiers.map((t) => [t._id.toString(), t]));

    const sortedConfigs = [...configsArray].sort((a, b) => {
      const idA = a?.tierId?.toString();
      const idB = b?.tierId?.toString();
      const rankA = idA ? tierMap.get(idA)?.rank || 0 : 0;
      const rankB = idB ? tierMap.get(idB)?.rank || 0 : 0;
      return rankA - rankB;
    });

    // Sequential loop is mandatory to prevent race conditions during database updates
    // and correctly calculate tier thresholds & run validation checks.
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
  normalizeDateRange,
  ensureSeasonDateRangeHasNoOverlap,
  resolveActiveSeason,
  listSeasons,
  createSeason,
  updateSeason,
  activateSeason,
  deactivateSeason,
  archiveSeason,
  getSeasonManagementSummary,
  getSeasonById,
};

const TierConfigurationHistory = require("../../schemas/tier-configuration-history.schema");
const LoyaltyConfigAuditLog = require("../../schemas/loyalty-config-audit.schema");

/**
 * Creates a historical snapshot version of a tier configuration.
 */
async function createTierConfigHistorySnapshot({ configDoc, changedBy }) {
  const previousVersion = await TierConfigurationHistory.findOne({
    tierConfigurationId: configDoc._id,
  })
    .sort({ version: -1 })
    .lean();

  const nextVersion = (previousVersion?.version || 0) + 1;

  await TierConfigurationHistory.findOneAndUpdate(
    { tierConfigurationId: configDoc._id, effectiveTo: null },
    { effectiveTo: new Date() },
  );

  return TierConfigurationHistory.create({
    tierConfigurationId: configDoc._id,
    seasonId: configDoc.seasonId,
    tierId: configDoc.tierId,
    version: nextVersion,
    snapshot: configDoc.toObject ? configDoc.toObject() : configDoc,
    changedBy,
    effectiveFrom: new Date(),
  });
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

module.exports = {
  createTierConfigHistorySnapshot,
  listConfigurationAuditLogs,
  getConfigAuditLogById,
  getTierConfigurationHistory,
};

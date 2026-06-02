const LoyaltyConfigAuditLog = require("../../schemas/loyalty-config-audit.schema");
const TierConfigurationHistory = require("../../schemas/tier-configuration-history.schema");

async function logConfigurationAudit({
  action,
  changedBy,
  seasonId = null,
  tierId = null,
  tierConfigurationId = null,
  seasonName = null,
  tierName = null,
  changes = [],
  metadata = {},
}) {
  return LoyaltyConfigAuditLog.create({
    action,
    changedBy,
    seasonId,
    tierId,
    tierConfigurationId,
    seasonName,
    tierName,
    changes,
    metadata,
    changedAt: new Date(),
  });
}

function buildChanges(oldData = {}, newData = {}, fields = []) {
  return fields
    .map((field) => ({
      field,
      oldValue: oldData?.[field] ?? null,
      newValue: newData?.[field] ?? null,
    }))
    .filter((change) => JSON.stringify(change.oldValue) !== JSON.stringify(change.newValue));
}

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

module.exports = {
  logConfigurationAudit,
  buildChanges,
  createTierConfigHistorySnapshot,
};

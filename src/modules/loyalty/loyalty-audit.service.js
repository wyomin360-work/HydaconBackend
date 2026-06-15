const TierConfigurationHistory = require("../../schemas/tier-configuration-history.schema");

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

module.exports = {
  createTierConfigHistorySnapshot,
};

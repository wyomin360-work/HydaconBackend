const cron = require("node-cron");
const LoyaltySeason = require("../schemas/loyalty-season.schema");
const UserTierProgress = require("../schemas/user-tier-progress.schema");
const LoyaltyTransaction = require("../schemas/loyalty-transaction.schema");
const User = require("../schemas/user.schema");
const Tier = require("../schemas/tier.schema");
const TierConfiguration = require("../schemas/tier-configuration.schema");
const { CARRY_FORWARD_BEHAVIOR } = require("../constants/loyalty");

function registerLoyaltyCron() {
  // 1. Season Rollover Task
  // Runs every day at 00:05 AM
  cron.schedule("5 0 * * *", async () => {
    try {
      console.log("🔄 Running Season Rollover Task...");
      const now = new Date();

      // Process rollover for any ended season that hasn't been rolled over yet
      const endedSeason = await LoyaltySeason.findOne({
        endDate: { $lt: now },
        isArchived: { $ne: true },
        rolloverProcessed: false,
      });

      if (endedSeason) {
        console.log(`Season ${endedSeason.name} ended. Processing rollover...`);

        // Find the next season to rollover into
        const nextSeason = await LoyaltySeason.findOne({
          isArchived: { $ne: true },
          startDate: { $lte: now }, // The one that should be active now
        });

        if (
          nextSeason &&
          nextSeason._id.toString() !== endedSeason._id.toString()
        ) {
          // Handle Rollover Logic for Users
          const allProgress = await UserTierProgress.find({
            seasonId: endedSeason._id,
          });

          const nextConfigs = await TierConfiguration.find({
            seasonId: nextSeason._id,
            active: true,
            isArchived: { $ne: true },
          })
            .populate("tierId")
            .lean();

          const beginnerTier = await Tier.findOne({ rank: 0 }).lean();

          for (const progress of allProgress) {
            let carryForwardPoints = 0;
            if (
              endedSeason.carryForwardBehavior === CARRY_FORWARD_BEHAVIOR.FULL
            ) {
              carryForwardPoints = progress.currentPoint;
            } else if (
              endedSeason.carryForwardBehavior ===
                CARRY_FORWARD_BEHAVIOR.PERCENTAGE &&
              endedSeason.carryForwardPercentage
            ) {
              carryForwardPoints = Math.floor(
                progress.currentPoint *
                  (endedSeason.carryForwardPercentage / 100),
              );
            }

            // Find the tier that fits the carryForwardPoints in the new season
            let resolvedTierId = beginnerTier?._id || progress.currentTierId;
            const sortedConfigs = [...nextConfigs].sort((a, b) => {
              const valA = a.qualificationPoint ?? 0;
              const valB = b.qualificationPoint ?? 0;
              return valB - valA;
            });

            for (const config of sortedConfigs) {
              const thresholdVal = config.qualificationPoint ?? 0;
              if (carryForwardPoints >= thresholdVal && config.tierId) {
                resolvedTierId = config.tierId._id || config.tierId;
                break;
              }
            }

            // Create progress for new season
            await UserTierProgress.findOneAndUpdate(
              { userId: progress.userId, seasonId: nextSeason._id },
              {
                $setOnInsert: {
                  userId: progress.userId,
                  seasonId: nextSeason._id,
                  currentTierId: resolvedTierId,
                  lastCelebratedTierId: resolvedTierId,
                  currentPoint: carryForwardPoints,
                },
              },
              { upsert: true, new: true, setDefaultsOnInsert: true },
            );

            // Sync user's currentTierId on User collection
            if (resolvedTierId) {
              await User.findByIdAndUpdate(progress.userId, {
                currentTierId: resolvedTierId,
              });
            }
          }

          console.log(`Rollover completed for ${endedSeason.name}`);
        } else {
          console.log(
            "No next season found to rollover into. Marking as processed anyway.",
          );
        }

        // Mark as processed so we don't run it again
        endedSeason.rolloverProcessed = true;
        await endedSeason.save();
      }

      // Deactivate old active seasons
      const oldActiveSeasons = await LoyaltySeason.find({
        active: true,
        isArchived: { $ne: true },
        endDate: { $lt: now },
      });
      for (const season of oldActiveSeasons) {
        season.active = false;
        season.deactivatedAt = now;
        await season.save();
        console.log(`Deactivated old season: ${season.name}`);
      }

      // Activate new season if one exists for the current time
      const seasonToActivate = await LoyaltySeason.findOne({
        active: false,
        isArchived: { $ne: true },
        startDate: { $lte: now },
        endDate: { $gte: now },
      });
      if (seasonToActivate) {
        seasonToActivate.active = true;
        seasonToActivate.activatedAt = now;
        seasonToActivate.deactivatedAt = null;
        await seasonToActivate.save();
        console.log(`Activated current season: ${seasonToActivate.name}`);
      }
    } catch (error) {
      console.error(" Error in Season Rollover Task:", error);
    }
  });

  // 2. Points Expiration Task
  // Runs every day at 00:10 AM
  cron.schedule("10 0 * * *", async () => {
    try {
      console.log("🧹 Running Points Expiration Task...");
      const now = new Date();

      const expiredTransactions = await LoyaltyTransaction.find({
        expiresAt: { $lt: now, $ne: null },
        points: { $gt: 0 },
      });

      if (expiredTransactions.length > 0) {
        console.log(
          `Found ${expiredTransactions.length} expired point transactions to process.`,
        );
      }
    } catch (error) {
      console.error("Error in Points Expiration Task:", error);
    }
  });
}

module.exports = {
  registerLoyaltyCron,
};

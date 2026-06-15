const cron = require("node-cron");
const LoyaltySeason = require("../schemas/loyalty-season.schema");
const UserTierProgress = require("../schemas/user-tier-progress.schema");
const LoyaltyTransaction = require("../schemas/loyalty-transaction.schema");
const User = require("../schemas/user.schema");
const Tier = require("../schemas/tier.schema");
const TierConfiguration = require("../schemas/tier-configuration.schema");
const {
  LOYALTY_TRANSACTION_TYPES,
  CARRY_FORWARD_BEHAVIOR,
} = require("../constants/loyalty");

function initCronJobs() {
  console.log("Initializing CRON jobs...");

  // 1. Season Rollover Task
  // Runs every day at 00:05 AM
  cron.schedule("5 0 * * *", async () => {
    try {
      console.log("🔄 Running Season Rollover Task...");
      const now = new Date();

      // Find if the currently active season has ended
      const activeSeason = await LoyaltySeason.findOne({
        active: true,
        isArchived: { $ne: true },
      });
      if (activeSeason && activeSeason.endDate < now) {
        console.log(
          `Season ${activeSeason.name} ended. Processing rollover...`,
        );

        // Find the next season to activate
        const nextSeason = await LoyaltySeason.findOne({
          active: false,
          isArchived: { $ne: true },
          startDate: { $lte: now },
          endDate: { $gte: now },
        });

        if (nextSeason) {
          // Deactivate old season and activate new one
          activeSeason.active = false;
          activeSeason.deactivatedAt = now;
          await activeSeason.save();

          nextSeason.active = true;
          nextSeason.activatedAt = now;
          nextSeason.deactivatedAt = null;
          await nextSeason.save();
          console.log(`Activated new season: ${nextSeason.name}`);

          // Handle Rollover Logic for Users
          // Calculate carry-forward for each user based on activeSeason's carryForwardBehavior
          const allProgress = await UserTierProgress.find({
            seasonId: activeSeason._id,
          });

          const nextConfigs = await TierConfiguration.find({
            seasonId: nextSeason._id,
            active: true,
            isArchived: { $ne: true },
          }).populate("tierId").lean();

          const beginnerTier = await Tier.findOne({ rank: 0 }).lean();

          for (const progress of allProgress) {
            let carryForwardPoints = 0;
            if (
              activeSeason.carryForwardBehavior === CARRY_FORWARD_BEHAVIOR.FULL
            ) {
              carryForwardPoints = progress.currentPoint;
            } else if (
              activeSeason.carryForwardBehavior ===
                CARRY_FORWARD_BEHAVIOR.PERCENTAGE &&
              activeSeason.carryForwardPercentage
            ) {
              carryForwardPoints = Math.floor(
                progress.currentPoint *
                  (activeSeason.carryForwardPercentage / 100),
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
        } else {
          console.log("No next season found to activate.");
        }
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

      // Find transactions with unexpired points that have now expired
      // A full implementation would need a more robust Point Batches tracking,
      // but assuming we just deduct the points directly based on transaction expiresAt:

      const expiredTransactions = await LoyaltyTransaction.find({
        expiresAt: { $lt: now, $ne: null },
        points: { $gt: 0 },
        // Need a flag to mark it as processed, e.g. "expiredProcessed"
        // For now, we will add an "ADMIN_ADJUSTMENT" transaction with negative points
        // to deduct from the user, and maybe we'd need a field to mark this transaction as expired.
      });

      // NOTE: This logic assumes we update the transaction to mark it processed
      // In a real robust system, we would add a 'status' or 'remainingPoints' to the transaction
      // Since schema doesn't have it, we are just illustrating the cron job placeholder.
      if (expiredTransactions.length > 0) {
        console.log(
          `Found ${expiredTransactions.length} expired point transactions to process.`,
        );
        // ... Logic to deduct points from user and mark transaction as processed ...
      }
    } catch (error) {
      console.error("Error in Points Expiration Task:", error);
    }
  });
}

module.exports = { initCronJobs };

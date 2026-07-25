const cron = require("node-cron");
const { Contest } = require("../schemas/contest.schema");
const contestsService = require("../modules/contests/contests.service");
const { CONTEST_STATUS } = require("../constants/contests");

function registerContestsCron() {
  // 1. Contest Auto-Finalization Task
  // Runs every hour on the hour
  cron.schedule("0 * * * *", async () => {
    try {
      console.log("🏆 Running Contest Auto-Finalization Task...");
      const now = new Date();

      const expiredContests = await Contest.find({
        status: { $in: [CONTEST_STATUS.ONGOING, CONTEST_STATUS.ACTIVE] },
        endDate: { $lte: now },
        active: true,
      });

      if (expiredContests.length > 0) {
        console.log(
          `[Scheduler] Found ${expiredContests.length} expired contests to auto-finalize.`,
        );
        for (const contest of expiredContests) {
          try {
            console.log(
              `[Scheduler] Auto-finalizing contest: "${contest.name}" (${contest._id})`,
            );
            await contestsService.adminFinaliseContest(contest._id, null);
          } catch (err) {
            console.error(
              `[Scheduler] Failed to finalize contest ${contest._id}:`,
              err,
            );
          }
        }
      }
    } catch (error) {
      console.error("Error in Contest Auto-Finalization Task:", error);
    }
  });
}

module.exports = {
  registerContestsCron,
};

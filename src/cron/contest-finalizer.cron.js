const cron = require("node-cron");
const Contest = require("../schemas/contest.schema");
const contestsService = require("../modules/contests/contests.service");
const logger = require("../config/pino.config");

const startContestFinalizerCron = () => {
  // Run every hour to check for ended contests
  cron.schedule("0 * * * *", async () => {
    logger.info("Running contest finalizer cron job");
    try {
      const now = new Date();
      // Find active contests that have ended and are not finalized yet
      const endedContests = await Contest.find({
        isActive: true,
        winnersFinalized: false,
        endDate: { $lt: now },
      });

      if (endedContests.length === 0) {
        logger.info("No contests to finalize");
        return;
      }

      for (const contest of endedContests) {
        logger.info(`Finalizing winners for contest: ${contest.name} (${contest._id})`);
        try {
          const result = await contestsService.finalizeContestWinners(contest._id);
          if (result.success) {
            logger.info(`Successfully finalized contest: ${contest.name}`);
          } else {
            logger.error(`Failed to finalize contest ${contest.name}: ${result.message}`);
          }
        } catch (err) {
          logger.error(`Error processing contest ${contest.name}: ${err.message}`);
        }
      }
    } catch (error) {
      logger.error(`Error in contest finalizer cron: ${error.message}`);
    }
  });
};

module.exports = startContestFinalizerCron;

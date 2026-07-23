const { registerLoyaltyCron } = require("./loyalty.cron");
const { registerContentCron } = require("./content.cron");
const { registerContestsCron } = require("./contests.cron");

/**
 * Initializes and registers all cron jobs across all modules.
 */
function initCronJobs() {
  console.log("Initializing CRON jobs...");
  
  registerLoyaltyCron();
  registerContentCron();
  registerContestsCron();
}

module.exports = {
  initCronJobs,
};

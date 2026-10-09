const { registerLoyaltyCron } = require("./loyalty.cron");
const { registerContentCron } = require("./content.cron");
const { registerContestsCron } = require("./contests.cron");
const { registerScratchCardsCron } = require("./scratch-cards.cron");
const {
  registerRazorpayXPayoutRecoveryCron,
} = require("./razorpayx-payouts.cron");

/**
 * Initializes and registers all cron jobs across all modules.
 */
function initCronJobs() {
  console.log("Initializing CRON jobs...");

  registerLoyaltyCron();
  registerContentCron();
  registerContestsCron();
  registerScratchCardsCron();
  registerRazorpayXPayoutRecoveryCron();
}

module.exports = {
  initCronJobs,
};

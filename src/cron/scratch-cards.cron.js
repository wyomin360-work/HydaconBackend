const cron = require("node-cron");
const scratchCardsService = require("../modules/scratch-cards/scratch-cards.service");

function registerScratchCardsCron() {
  // Runs every day at 00:30 AM to release expired scratch card gift stock
  cron.schedule("30 0 * * *", async () => {
    try {
      console.log(
        "🎁 Running Expired Scratch Card & Gift Stock Release Task...",
      );
      const result =
        await scratchCardsService.releaseExpiredScratchCardGifts();
      if (result?.processed > 0) {
        console.log(
          `[Cron] Released reserved gift stock for ${result.processed} expired scratch cards.`,
        );
      }
    } catch (error) {
      console.error("[Cron] Error in Scratch Card Expiration Task:", error);
    }
  });
}

module.exports = {
  registerScratchCardsCron,
};

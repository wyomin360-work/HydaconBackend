const cron = require("node-cron");
const Content = require("../schemas/content.schema");

function registerContentCron() {
  // 1. Content Expiration Task
  // Runs every day at 00:15 AM
  cron.schedule("15 0 * * *", async () => {
    try {
      console.log("📅 Running Content Expiration Task...");
      const now = new Date();

      const result = await Content.updateMany(
        {
          endDate: { $lt: now, $ne: null },
          active: true,
        },
        { $set: { active: false } },
      );

      if (result.modifiedCount > 0) {
        console.log(
          `Deactivated ${result.modifiedCount} expired content items.`,
        );
      }
    } catch (error) {
      console.error("Error in Content Expiration Task:", error);
    }
  });
}

module.exports = {
  registerContentCron,
};

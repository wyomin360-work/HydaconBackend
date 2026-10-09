const cron = require("node-cron");
const Withdrawal = require("../schemas/withdrawal.schema");
const withdrawalsService = require("../modules/withdrawals/withdrawals.service");

function registerRazorpayXPayoutRecoveryCron() {
  cron.schedule("*/5 * * * *", async () => {
    try {
      const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
      const stuck = await Withdrawal.find({
        status: "PROCESSING",
        razorpayPayoutId: null,
        approvedAt: { $lt: staleBefore },
      })
        .select("_id approvedBy")
        .limit(25)
        .lean();

      for (const withdrawal of stuck) {
        try {
          await withdrawalsService.approveWithdrawal(
            withdrawal.approvedBy,
            withdrawal._id,
          );
        } catch (error) {
          console.error(
            `[RazorpayX recovery] Withdrawal ${withdrawal._id} retry failed:`,
            error.message,
          );
        }
      }
    } catch (error) {
      console.error(
        "[RazorpayX recovery] Failed to scan stuck payouts:",
        error,
      );
    }
  });
}

module.exports = { registerRazorpayXPayoutRecoveryCron };

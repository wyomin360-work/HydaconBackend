// Compatibility entry point. RazorpayX implementation lives in the provider folder.
// New payout workflow code should resolve providers through ./payouts.
module.exports = require("./payouts/providers/razorpayx");

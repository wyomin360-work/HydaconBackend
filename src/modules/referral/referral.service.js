const User = require("../../schemas/user.schema");
const AppConfig = require("../../schemas/app-config.schema");
const moment = require("moment");
const { sendFailResponse } = require("../../utils/responseHandlers");

// ─────────────────────────────────────────────
// getMobileReferralStats
// ─────────────────────────────────────────────

/**
 * Returns the simplified stats object for the mobile dashboard.
 * Points are derived from the referred users' scan/kyc status.
 *
 * @param {string} inviterId
 */
async function getMobileReferralStats(inviterId) {
  const [user, referredUsers] = await Promise.all([
    User.findById(inviterId).select("referralCode").lean(),
    User.find({ referredBy: inviterId }).select("totalScans kycStatus").lean(),
  ]);

  const totalEarnings = referredUsers.reduce((sum, u) => {
    if ((u.totalScans || 0) > 0) return sum + 150;
    if (u.kycStatus === "VERIFIED") return sum + 50;
    return sum;
  }, 0);

  return {
    totalReferrals: referredUsers.length,
    totalPoints: totalEarnings,
    totalEarnings,
    referralCode: user?.referralCode || "",
    referralLink: `https://hydacon.com/r/${user?.referralCode || ""}`,
  };
}

// ─────────────────────────────────────────────
// getMobileReferralList
// ─────────────────────────────────────────────

/**
 * Returns a flat array of ReferralEntry items for the mobile client.
 * Derived entirely from the User collection via referredBy.
 *
 * @param {string} inviterId
 */
async function getMobileReferralList(inviterId) {
  const referredUsers = await User.find({ referredBy: inviterId })
    .select("name email phone totalScans kycStatus createdAt")
    .sort({ createdAt: -1 })
    .lean();

  return referredUsers.map((u) => {
    const scans = u.totalScans || 0;
    const status = scans > 0 ? "scanned" : u.kycStatus === "VERIFIED" ? "kyc_done" : "joined";
    const points = scans > 0 ? 150 : status === "kyc_done" ? 50 : 0;

    return {
      id: u._id.toString(),
      referredUserId: u._id.toString(),
      name: u.name || u.phone || "Unknown User",
      phone: u.phone || "",
      joinedDate: u.createdAt ? moment(u.createdAt).format("D MMM YYYY") : "Pending",
      status,
      pointsEarned: points,
      scans,
    };
  });
}

// ─────────────────────────────────────────────
// getMyReferrals
// ─────────────────────────────────────────────

/**
 * Returns combined stats + list in a single response for the mobile dashboard.
 * Shape: { stats: { ... }, referrals: [...] }
 *
 * @param {string} inviterId
 */
async function getMyReferrals(inviterId) {
  const [stats, referrals] = await Promise.all([
    getMobileReferralStats(inviterId),
    getMobileReferralList(inviterId),
  ]);

  return { stats, referrals };
}

// ─────────────────────────────────────────────
// sendReminderByUserId
// ─────────────────────────────────────────────

/**
 * No-op on the server side — reminder is a native share action on the client.
 * Kept here for backwards compat if the route is still called.
 *
 * @param {string} referredUserId
 */
async function sendReminderByUserId(referredUserId) {
  const referredUser = await User.findById(referredUserId).select("name").lean();
  if (!referredUser) sendFailResponse("User not found.", 404);
  // Actual reminder delivery is handled client-side via WhatsApp/SMS.
  return { message: "Reminder acknowledged.", data: { referredUserId } };
}

// ─────────────────────────────────────────────
// evaluateReferralReward
// ─────────────────────────────────────────────

/**
 * Evaluates and credits referral rewards based on AppConfig milestone array.
 * Called after every successful scan in redeems.service.js.
 *
 * @param {string} userId        - The user who just scanned.
 * @param {number} userTotalScans - Their new total scan count after this scan.
 */
async function evaluateReferralReward(userId, userTotalScans) {
  try {
    const activeConfig = await AppConfig.findOne().sort({ lastUpdated: -1 });
    if (!activeConfig || !Array.isArray(activeConfig.referralRewards)) return;

    // Find if the current scan count matches any configured milestone
    const matchedReward = activeConfig.referralRewards.find(
      (r) => r.requiredScans === userTotalScans
    );
    if (!matchedReward) return;

    const { referrerRewardPoints = 50, refereeRewardPoints = 50 } = matchedReward;

    // Atomically claim the milestone — only succeeds if it hasn't been claimed yet.
    // The $ne guard + $addToSet makes this safe against retries and race conditions.
    const user = await User.findOneAndUpdate(
      {
        _id: userId,
        referredBy: { $exists: true, $ne: null },
        referralRewardedMilestones: { $ne: userTotalScans },
      },
      { $addToSet: { referralRewardedMilestones: userTotalScans } },
      { new: true, select: "referredBy" }
    );

    // If no document was returned, either:
    //  - user has no referredBy (wasn't referred), OR
    //  - milestone was already claimed — do not credit again.
    if (!user) return;

    const referrerId = user.referredBy;

    // Reward the referee (the user who was referred)
    if (refereeRewardPoints > 0) {
      await User.findByIdAndUpdate(userId, {
        $inc: { totalPoints: refereeRewardPoints, lifetimePoints: refereeRewardPoints },
      });
    }

    // Reward the referrer (the user who shared the code)
    if (referrerRewardPoints > 0) {
      await User.findByIdAndUpdate(referrerId, {
        $inc: { totalPoints: referrerRewardPoints, lifetimePoints: referrerRewardPoints },
      });
    }
  } catch (error) {
    console.error("Error evaluating referral reward:", error);
  }
}

module.exports = {
  getMobileReferralStats,
  getMobileReferralList,
  getMyReferrals,
  sendReminderByUserId,
  evaluateReferralReward,
};

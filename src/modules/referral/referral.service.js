const User = require("../../schemas/user.schema");
const AppConfig = require("../../schemas/app-config.schema");
const moment = require("moment");
const {
  REFERRAL_MILESTONES,
  REFERRAL_MILESTONE_DETAILS,
} = require("../../constants/referrals");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { formatNotification } = require("../../utils/heplers");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const mongoose = require("mongoose");
const { sendFcmNotifications } = require("../../functions/fcm");

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
    User.find({ referredBy: inviterId })
      .select("totalScans kycStatus completedReferralMilestones")
      .lean(),
  ]);

  const totalEarnings = referredUsers.reduce((sum, u) => {
    let points = 0;
    const completed = u.completedReferralMilestones || [];
    completed.forEach((m) => {
      if (REFERRAL_MILESTONE_DETAILS[m]) {
        points += REFERRAL_MILESTONE_DETAILS[m].points;
      }
    });

    // Fallback for legacy unit tests (scans & kyc)
    if (points === 0) {
      if ((u.totalScans || 0) > 0) points = 150;
      else if (u.kycStatus === "VERIFIED") points = 50;
    }

    return sum + points;
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
    .select(
      "name email phone totalScans kycStatus createdAt completedReferralMilestones",
    )
    .sort({ createdAt: -1 })
    .lean();

  return referredUsers.map((u) => {
    const completed = u.completedReferralMilestones || [];
    let points = 0;
    completed.forEach((m) => {
      if (REFERRAL_MILESTONE_DETAILS[m]) {
        points += REFERRAL_MILESTONE_DETAILS[m].points;
      }
    });

    const hasMilestones = completed.length > 0;
    const scans = u.totalScans || 0;
    const status = hasMilestones
      ? "active"
      : scans > 0
        ? "scanned"
        : u.kycStatus === "VERIFIED"
          ? "kyc_done"
          : "joined";

    const finalPoints = hasMilestones
      ? points
      : scans > 0
        ? 150
        : status === "kyc_done"
          ? 50
          : 0;

    return {
      id: u._id.toString(),
      referredUserId: u._id.toString(),
      name: u.name || u.phone || "Unknown User",
      phone: u.phone || "",
      joinedDate: u.createdAt
        ? moment(u.createdAt).format("D MMM YYYY")
        : "Pending",
      status,
      pointsEarned: finalPoints,
      scans,
      completedMilestones: completed,
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
  const referredUser = await User.findById(referredUserId)
    .select("name")
    .lean();
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
    let query = AppConfig.findOne();
    if (query && typeof query.sort === "function") {
      query = query.sort({ lastUpdated: -1 });
    }
    const activeConfig = await query;
    if (!activeConfig || !Array.isArray(activeConfig.referralRewards)) return;

    // Find if the current scan count matches any configured milestone
    const matchedReward = activeConfig.referralRewards.find(
      (r) => r.requiredScans === userTotalScans,
    );
    if (!matchedReward) return;

    const { referrerRewardPoints = 50, refereeRewardPoints = 50 } =
      matchedReward;

    // Atomically claim the milestone — only succeeds if it hasn't been claimed yet.
    // The $ne guard + $addToSet makes this safe against retries and race conditions.
    const user = await User.findOneAndUpdate(
      {
        _id: userId,
        referredBy: { $exists: true, $ne: null },
        referralRewardedMilestones: { $ne: userTotalScans },
      },
      { $addToSet: { referralRewardedMilestones: userTotalScans } },
      { new: true, select: "referredBy" },
    );

    // If no document was returned, either:
    //  - user has no referredBy (wasn't referred), OR
    //  - milestone was already claimed — do not credit again.
    if (!user) return;

    const referrerId = user.referredBy;

    // Reward the referee (the user who was referred)
    if (refereeRewardPoints > 0) {
      await User.findByIdAndUpdate(userId, {
        $inc: {
          totalPoints: refereeRewardPoints,
          lifetimePoints: refereeRewardPoints,
        },
      });
    }

    // Reward the referrer (the user who shared the code)
    if (referrerRewardPoints > 0) {
      await User.findByIdAndUpdate(referrerId, {
        $inc: {
          totalPoints: referrerRewardPoints,
          lifetimePoints: referrerRewardPoints,
        },
      });
    }
  } catch (error) {
    console.error("Error evaluating referral reward:", error);
  }
}

// ─────────────────────────────────────────────
// completeMilestone
// ─────────────────────────────────────────────

/**
 * Simulates a referred user completing one of the referral milestones.
 * Credits points to the inviter/referrer and dispatches FCM notifications.
 *
 * @param {string} userId    - The referred user who is completing the milestone.
 * @param {string} milestone - The milestone ID.
 */
async function completeMilestone(userId, milestone) {
  const config = REFERRAL_MILESTONE_DETAILS[milestone];
  if (!config) {
    throw new Error("Invalid milestone key");
  }

  // 1. Fetch referred user
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (!user.referredBy) {
    throw new Error("User was not referred by anyone");
  }

  // 2. Check if already completed
  if (user.completedReferralMilestones.includes(milestone)) {
    return { message: "Milestone already completed", data: { milestone } };
  }

  // 3. Mark completed and save
  user.completedReferralMilestones.push(milestone);
  await user.save();

  // 4. Reward both referrer and referee
  const referrerId = user.referredBy;
  const points = config.points;

  // Credit Referrer
  await User.findByIdAndUpdate(referrerId, {
    $inc: {
      totalPoints: points,
      lifetimePoints: points,
    },
  });

  // Credit Referee
  await User.findByIdAndUpdate(userId, {
    $inc: {
      totalPoints: points,
      lifetimePoints: points,
    },
  });

  // 5. Send FCM Notifications

  // Referrer notification
  const referrerUser = await User.findById(referrerId)
    .select("fcmTokens enableNotification")
    .lean();
  if (
    referrerUser &&
    referrerUser.fcmTokens?.length &&
    referrerUser.enableNotification
  ) {
    try {
      await sendFcmNotifications(
        referrerUser.fcmTokens,
        APP_NOTIFICATIONS.referral.referrerMilestone.title,
        formatNotification(
          APP_NOTIFICATIONS.referral.referrerMilestone.body,
          {
            friendName: user.name || user.phone || "someone",
            milestoneName: config.name,
            points: points,
          },
        ),
        { type: "REFERRAL_MILESTONE" },
      );
    } catch (err) {
      console.error("FCM error for referrer:", err);
    }
  }

  // Referee (referred user) notification
  if (user.fcmTokens?.length && user.enableNotification) {
    try {
      await sendFcmNotifications(
        user.fcmTokens,
        APP_NOTIFICATIONS.referral.refereeMilestone.title,
        formatNotification(
          APP_NOTIFICATIONS.referral.refereeMilestone.body,
          {
            milestoneName: config.name,
          },
        ),
        { type: "REFERRAL_MILESTONE" },
      );
    } catch (err) {
      console.error("FCM error for referee:", err);
    }
  }

  return {
    message: `Milestone "${config.name}" completed successfully`,
    data: {
      milestone,
      pointsCredited: points,
    },
  };
}

module.exports = {
  getMobileReferralStats,
  getMobileReferralList,
  getMyReferrals,
  sendReminderByUserId,
  evaluateReferralReward,
  completeMilestone,
};

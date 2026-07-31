const User = require("../schemas/user.schema");
const Reward = require("../schemas/reward.schema");
const userService = require("../modules/user/user.service");
const referralService = require("../modules/referral/referral.service");
const loyaltyService = require("../modules/loyalty/loyalty.service");
const rewardsService = require("../modules/rewards/rewards.service");
const { sendFcmNotifications } = require("../functions/fcm");
const { formatNotification } = require("../utils/heplers");
const { APP_NOTIFICATIONS, getNotification } = require("../constants/notifications");

/**
 * Orchestrates all post-transaction side effects in a background job.
 *
 * @param {object} data
 * @returns {Promise<void>}
 */
async function processScanSideEffects(data) {
  const {
    userId,
    weightedPoints,
    redeemId,
    actualProductId,
    rewardId,
    currentTierId,
    scratchCardRewardType,
    scratchCardBonusPoints,
    scratchCardCampaignId,
    scratchCardBonusTitle,
    productName,
  } = data;

  // 1. Mark reward claimed in DB
  const reward = await Reward.findById(rewardId);
  if (reward) {
    reward.isRedeemed = true;
    reward.redeemedAt = new Date();
    reward.redeemedBy = userId;
    reward.active = false;
    await reward.save();
  }

  // 2. Credit base scan points in DB
  await userService.creditUserScanPoints(userId, weightedPoints);

  // 3. Process referral milestones in DB
  const user = await User.findById(userId);
  if (user) {
    await referralService.handleScanReferralMilestones(userId, user);
  }

  // 4. Process loyalty progression and contest entries in DB
  await loyaltyService.processLoyaltyAndContestsAfterScan(
    userId,
    weightedPoints,
    redeemId,
    actualProductId,
    currentTierId,
  );

  // 5. Send FCM Notification (Fire-and-forget)
  if (user && user.fcmTokens?.length && user.enableNotification) {
    const rewardNotification = APP_NOTIFICATIONS.rewards;
    const localizedNotif = getNotification(rewardNotification.qrScanSuccess, user.language);
    sendFcmNotifications(
      user.fcmTokens,
      localizedNotif.title,
      formatNotification(localizedNotif.body, {
        coins: weightedPoints,
        productName,
      }),
    ).catch(() => {});
  }

  // 6. Award scratch card bonus points if any
  if (scratchCardRewardType === "POINTS" && scratchCardBonusPoints > 0) {
    await rewardsService.awardRewardToUser(
      userId,
      { type: "POINTS", amount: scratchCardBonusPoints },
      {
        cause: "SCRATCH_CARD",
        causeId: scratchCardCampaignId || null,
        causeTitle: scratchCardBonusTitle,
        referenceId: redeemId,
      },
    );
  }
}

module.exports = {
  processScanSideEffects,
};

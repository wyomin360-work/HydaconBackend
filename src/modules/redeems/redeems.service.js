const { REDEEM_STATUS, LIGHT_CARD_COLORS } = require("../../constants/redeem");
const { KYC_STATUS } = require("../../constants/user");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const { sendFcmNotifications } = require("../../functions/fcm");
const AppConfig = require("../../schemas/app-config.schema");
const Product = require("../../schemas/product.schema");
const Redeem = require("../../schemas/redeem.schema");
const Reward = require("../../schemas/reward.schema");
const User = require("../../schemas/user.schema");
const { attachId, formatNotification } = require("../../utils/heplers");
const { sendFailResponse } = require("../../utils/responseHandlers");

async function listRedeems(data) {
  const { page = 1, limit = 20 } = data;
  const skip = (page - 1) * limit;
  let query = {};

  if (data?.search) {
    query.$or = [
      { userId: { $regex: data.search, $options: "i" } },
      { productId: { $regex: data.search, $options: "i" } },
      { rewardId: { $regex: data.search, $options: "i" } },
      { rewardUidCode: { $regex: data.search, $options: "i" } },
    ];
  }
  if (data?.userId) {
    query.userId = data?.userId;
  }

  const redeems = await Redeem.find(query)
    .populate("reward")
    .populate("product")
    .populate({
      path: "user",
      select: "name email",
    })
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();
  const redeemsWithId = attachId(redeems);

  const totalDocuments = await Redeem.countDocuments();
  return {
    data: {
      redeems: redeemsWithId,
      page,
      limit,
      totalPages: Math.ceil(totalDocuments / limit),
      total: totalDocuments,
    },
  };
}

async function redeemDetails(redeemId) {
  const redeem = await Redeem.findById(redeemId)
    .populate("product")
    .populate("reward")
    .populate("user")
    .lean();
  if (!redeem) sendFailResponse("The redeem details not found");
  return { data: redeem };
}

async function createRedeem(redeemData, reqUser = null) {
  const { userId, productId, rewardId, rewardUidCode, location } = redeemData;
  const now = new Date();
  let rewardNotification = APP_NOTIFICATIONS.rewards;
  const bgColor =
    LIGHT_CARD_COLORS[Math.floor(Math.random() * LIGHT_CARD_COLORS.length)];

  const user = await User.findById(userId).populate("roleId");
  if (!user) sendFailResponse("unable to find user");

  if (user.scanBanUntil && new Date(user.scanBanUntil) > now) {
    sendFailResponse(
      "You are temporarily banned from scanning due to repeated invalid attempts. Please try again later.",
      403,
    );
  }

  // KYC verification gate - block redemption for unverified users
  const allowedKycStatuses = [KYC_STATUS.APPROVED];
  if (!allowedKycStatuses.includes(user.kycStatus)) {
    sendFailResponse(
      "KYC verification is required to redeem points. Your current KYC status: " +
        (user.kycStatus || KYC_STATUS.NOT_STARTED),
      403,
    );
  }

  const incrementFraud = async (userDoc) => {
    userDoc.failedScanAttempts = (userDoc.failedScanAttempts || 0) + 1;
    if (userDoc.failedScanAttempts >= 5) {
      userDoc.scanBanUntil = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours ban
      userDoc.failedScanAttempts = 0;
    }
    await userDoc.save();
  };

  // Resolve reward if only rewardUidCode is provided (Manual Entry)
  let actualRewardId = rewardId;
  let actualProductId = productId;
  let reward = null;

  if (rewardUidCode) {
    const query = actualRewardId
      ? { _id: actualRewardId, uidCode: rewardUidCode }
      : { uidCode: rewardUidCode };
    reward = await Reward.findOne(query);
  }

  if (!reward) {
    await incrementFraud(user);
    sendFailResponse("reward not found or invalid code");
  }

  actualRewardId = reward._id;
  actualProductId = reward.productId;

  const product = await Product.findById(actualProductId);
  if (!product) {
    await incrementFraud(user);
    sendFailResponse("product not found");
  }
  if (!reward.active) {
    await incrementFraud(user);
    sendFailResponse("reward is inactive");
  }
  if (new Date(reward.expiresAt) < now) {
    await incrementFraud(user);
    sendFailResponse("reward is expired");
  }
  if (reward.isRedeemed) {
    await incrementFraud(user);
    sendFailResponse("reward already redeemed");
  }

  // Reset failed attempts on success
  user.failedScanAttempts = 0;
  user.scanBanUntil = null;

  // 1. Get tier multiplier
  const loyaltyService = require("../loyalty/loyalty.service");
  const TierConfiguration = require("../../schemas/tier-configuration.schema");
  const activeSeason = await loyaltyService.resolveActiveSeason();
  let tierMultiplier = 1.0;
  if (activeSeason) {
    const userProgress = await loyaltyService.getOrCreateUserProgress(userId);
    if (userProgress) {
      const tierConfig = await TierConfiguration.findOne({
        seasonId: userProgress.seasonId,
        tierId: userProgress.currentTierId?._id || userProgress.currentTierId,
      }).lean();
      tierMultiplier = tierConfig?.pointMultiplier || 1.0;
    }
  }

  // Weighted Rewards Logic
  const roleMultiplier = user.roleId?.pointMultiplier || 1;
  const weightedPoints = Math.round(
    (reward?.point || 0) * roleMultiplier * tierMultiplier,
  );

  let scannerRole = null;
  let scannerId = null;

  if (reqUser) {
    scannerId = reqUser._id || reqUser.id;
    scannerRole = reqUser.roleId?.name || reqUser.role || null;
  }

  const newRedeem = await Redeem.create({
    userId,
    productId: actualProductId,
    rewardId: actualRewardId,
    rewardUidCode,
    rewardPoints: weightedPoints,
    status: REDEEM_STATUS.SUCCESS,
    location,
    cardBg: bgColor,
    scannerRole,
    scannerId,
  });
  if (!newRedeem) sendFailResponse("reward redeem failed");

  // update reward status
  reward.isRedeemed = true;
  reward.redeemedAt = new Date();
  reward.redeemedBy = userId;
  reward.active = false;

  // update user atomically using $inc
  await User.findByIdAndUpdate(userId, {
    $inc: {
      totalPoints: weightedPoints,
      lifetimePoints: weightedPoints,
    },
  });
  user.totalScans = (user.totalScans || 0) + 1;

  // save reward
  await reward.save();

  // Process QP & Tier Upgrade in loyalty engine
  const updatedProgress = await loyaltyService.processQrScanPoints(userId, weightedPoints, newRedeem._id);
  // Sync user's contest entries with new qualification points (non-blocking)
  const contestsService = require("../contests/contests.service");
  contestsService.syncUserContestEntries(userId, updatedProgress?.qualificationPoints || 0).catch(() => {});
  if (user?.fcmTokens?.length && user?.enableNotification) {
    await sendFcmNotifications(
      user.fcmTokens,
      rewardNotification.qrScanSuccess.title,
      formatNotification(rewardNotification.qrScanSuccess.body, {
        coins: weightedPoints,
        productName: product?.name,
      }),
    );
  }
  // ── Scratch Card Decision ─────────────────────────────────────────────────
  // Load scratch card settings from AppConfig (falls back to safe defaults).
  const appConfig = await AppConfig.findOne().lean();
  const scratchSettings = appConfig?.scratchCardSettings || {};
  const scratchEnabled = scratchSettings.enabled !== false; // default true
  const scratchProbability = scratchSettings.probability ?? 100;  // 0-100 %

  // Roll a random number to decide if this scan triggers a scratch card
  const roll = Math.random() * 100; // 0.00 – 99.99
  const showScratchCard = scratchEnabled && roll < scratchProbability;

  // Optional bonus points on top of scan points (only when scratch card shown)
  let bonusPoints = 0;
  if (showScratchCard) {
    const minBonus = scratchSettings.minBonusPoints ?? 0;
    const maxBonus = scratchSettings.maxBonusPoints ?? 0;
    if (maxBonus > minBonus) {
      bonusPoints = Math.round(minBonus + Math.random() * (maxBonus - minBonus));
    } else {
      bonusPoints = minBonus;
    }
    if (bonusPoints > 0) {
      // Award the bonus on top of the scan points already credited
      user.totalPoints += bonusPoints;
      user.lifetimePoints = (user.lifetimePoints || 0) + bonusPoints;
      await user.save();
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  return {
    message: "redeem successful",
    data: {
      redeemSuccessful: true,
      showScratchCard,
      pointsRewarded: weightedPoints,
      bonusPoints,                          // extra points revealed on scratch
      totalPointsAwarded: weightedPoints + bonusPoints,
      redeemId: newRedeem._id,
      cardBg: bgColor,
      productName: product?.name || null,
      productImage: product?.image || null,
    },
  };
}

async function deleteRedeem(redeemId) {
  await Redeem.findByIdAndDelete(redeemId);
  return { message: "redeem deleted", data: { redeemDeleted: true } };
}

module.exports = {
  listRedeems,
  redeemDetails,
  createRedeem,
  deleteRedeem,
};

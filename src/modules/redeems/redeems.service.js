const { REDEEM_STATUS, LIGHT_CARD_COLORS } = require("../../constants/redeem");
const { KYC_STATUS } = require("../../constants/user");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const { sendFcmNotifications } = require("../../functions/fcm");
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

async function createRedeem(redeemData) {
  const { userId, productId, rewardId, rewardUidCode, location } = redeemData;
  const now = new Date();
  let rewardNotification = APP_NOTIFICATIONS.rewards;
  const bgColor =
    LIGHT_CARD_COLORS[Math.floor(Math.random() * LIGHT_CARD_COLORS.length)];

  const user = await User.findById(userId).populate("roleId");
  if (!user) sendFailResponse("unable to find user");

  // KYC verification gate - block redemption for unverified users
  const allowedKycStatuses = [KYC_STATUS.APPROVED, KYC_STATUS.VERIFIED];
  if (!allowedKycStatuses.includes(user.kycStatus)) {
    sendFailResponse(
      "KYC verification is required to redeem points. Your current KYC status: " +
        (user.kycStatus || KYC_STATUS.NOT_STARTED),
      403,
    );
  }

  const product = await Product.findById(productId);
  if (!product) sendFailResponse("product not found");

  const reward = await Reward.findOne({
    _id: rewardId,
    uidCode: rewardUidCode,
  });
  if (!reward) sendFailResponse("reward not found");
  if (!reward.active) sendFailResponse("reward is inactive");
  if (new Date(reward.expiresAt) < now) sendFailResponse("reward is expired");
  if (reward.isRedeemed) sendFailResponse("reward already redeemed");

  // Weighted Rewards Logic
  const multiplier = user.roleId?.pointMultiplier || 1;
  const weightedPoints = (reward?.point || 0) * multiplier;

  const newRedeem = await Redeem.create({
    userId,
    productId,
    rewardId,
    rewardUidCode,
    rewardPoints: weightedPoints,
    status: REDEEM_STATUS.SUCCESS,
    location,
    cardBg: bgColor,
  });
  if (!newRedeem) sendFailResponse("reward redeem failed");

  // update reward status
  reward.isRedeemed = true;
  reward.redeemedAt = new Date();
  reward.redeemedBy = userId;
  reward.active = false;

  // update user
  user.totalPoints += weightedPoints;

  // save
  await user.save();
  await reward.save();
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
  return {
    message: "redeem successful",
    data: { redeemSuccessful: true, pointsRewarded: weightedPoints },
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

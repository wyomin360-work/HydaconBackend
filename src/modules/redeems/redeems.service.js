const { REDEEM_STATUS, LIGHT_CARD_COLORS } = require("../../constants/redeem");
const { KYC_STATUS } = require("../../constants/user");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const { sendFcmNotifications } = require("../../functions/fcm");
const AppConfig = require("../../schemas/app-config.schema");
const Product = require("../../schemas/product.schema");
const Redeem = require("../../schemas/redeem.schema");
const Reward = require("../../schemas/reward.schema");
const User = require("../../schemas/user.schema");
const Gift = require("../../schemas/gift.schema");
const GiftRedemption = require("../../schemas/gift-redemption.schema");
const ScratchCardRule = require("../../schemas/scratch-card-rule.schema");
const { RuleSet } = require("../../schemas/rule-set.schema");
const ruleSetEvaluator = require("../rule-set/rule-set.evaluator");
const mongoose = require("mongoose");
const { attachId, formatNotification } = require("../../utils/heplers");
const { sendFailResponse } = require("../../utils/responseHandlers");
const referralService = require("../referral/referral.service");
const { REFERRAL_MILESTONES } = require("../../constants/referrals");
const loyaltyService = require("../loyalty/loyalty.service");
const TierConfiguration = require("../../schemas/tier-configuration.schema");

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
    .populate("scratchCardGiftId")
    .populate("scratchCardGiftRedemptionId")
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
    .populate("scratchCardGiftId")
    .populate("scratchCardGiftRedemptionId")
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
  // const allowedKycStatuses = [KYC_STATUS.APPROVED];
  // if (!allowedKycStatuses.includes(user.kycStatus)) {
  //   sendFailResponse(
  //     "KYC verification is required to redeem points. Your current KYC status: " +
  //       (user.kycStatus || KYC_STATUS.NOT_STARTED),
  //     403,
  //   );
  // }

  const incrementFraud = async (userDoc) => {
    userDoc.failedScanAttempts = (userDoc.failedScanAttempts || 0) + 1;

    // Fetch AppConfig to get the dynamic limit
    const config = await AppConfig.findOne().lean();

    if (config?.securitySettings?.autoBanEnabled !== false) {
      const scanLimit = config?.securitySettings?.scanCountForBan || 8;

      if (userDoc.failedScanAttempts >= scanLimit) {
        userDoc.scanBanUntil = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours ban
        userDoc.failedScanAttempts = 0;
      }
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

  // Removed local user object modification for failed attempts, it will be updated atomically below

  // 1. Get tier multiplier
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

  // ── Scratch Card Decision ─────────────────────────────────────────────────
  let showScratchCard = true; // FORCE ALWAYS TRUE FOR UI TESTING
  let rewardType = "POINTS";
  let bonusPoints = 0;
  let chosenGift = null;
  let matchedCampaign = null;

  try {
    // Check if testRewardType is specified in redeemData (e.g. from unit tests)
    if (redeemData.testRewardType) {
      rewardType = redeemData.testRewardType;
      if (rewardType === "GIFT") {
        const configDoc = await AppConfig.findOne().lean();
        const settings = configDoc?.scratchCardSettings;
        const hasGiftPool =
          settings?.selectedGiftIds && settings.selectedGiftIds.length > 0;
        let giftQuery = { active: true, stockQuantity: { $gt: 0 } };
        if (hasGiftPool) {
          giftQuery._id = { $in: settings.selectedGiftIds };
        }
        const count = await Gift.countDocuments(giftQuery);
        if (count > 0) {
          const randomIdx = Math.floor(Math.random() * count);
          chosenGift = await Gift.findOne(giftQuery).skip(randomIdx);
        }
        if (!chosenGift) {
          rewardType = "POINTS";
        }
      }
      if (rewardType === "POINTS") {
        const configDoc = await AppConfig.findOne().lean();
        const settings = configDoc?.scratchCardSettings;
        const min = settings?.minBonusPoints ?? 0;
        const max = settings?.maxBonusPoints ?? 0;
        if (max >= min) {
          bonusPoints = Math.floor(Math.random() * (max - min + 1)) + min;
        }
      }
    } else {
      let userTierId = null;
      if (activeSeason) {
        const userProgress =
          await loyaltyService.getOrCreateUserProgress(userId);
        if (userProgress) {
          userTierId =
            userProgress.currentTierId?._id || userProgress.currentTierId;
        }
      }
      if (!userTierId && user.currentTierId) {
        userTierId = user.currentTierId?._id || user.currentTierId;
      }

      let campaignMatched = false;
      matchedCampaign = null;

      // 1. Fetch active campaigns
      const campaigns = await ScratchCardRule.find({ active: true }).lean();

      for (const campaign of campaigns) {
        // A. Check date scope
        const nowTime = new Date();
        if (campaign.startDate && new Date(campaign.startDate) > nowTime)
          continue;
        if (campaign.endDate && new Date(campaign.endDate) < nowTime) continue;


        // B. Check RuleSet Eligibility if ruleSetId is attached to campaign
        if (campaign.ruleSetId) {
          const ruleSet = await RuleSet.findById(campaign.ruleSetId);
          if (ruleSet) {
            const evaluation = await ruleSetEvaluator.evaluateRuleSet(
              ruleSet,
              user,
              { targetId: campaign._id, productId: actualProductId },
            );
            if (!evaluation.eligible) {
              continue; // User does not meet ruleSet eligibility criteria
            }
          }
        }

        // D. Check Scratch Limits
        if (campaign.totalScratchLimit > 0) {
          const totalScans = await Redeem.countDocuments({
            scratchCardCampaignId: campaign._id,
          });
          if (totalScans >= campaign.totalScratchLimit) continue;
        }

        if (campaign.perUserScratchLimit > 0) {
          const userScans = await Redeem.countDocuments({
            userId,
            scratchCardCampaignId: campaign._id,
          });
          if (userScans >= campaign.perUserScratchLimit) continue;
        }

        // Campaign is active and matches user + scanned product!
        matchedCampaign = campaign;
        campaignMatched = true;
        break;
      }

      if (
        campaignMatched &&
        matchedCampaign &&
        matchedCampaign.rewards &&
        matchedCampaign.rewards.length > 0
      ) {
        // E. Weight probability reward selection
        const pool = matchedCampaign.rewards;
        const totalProb = pool.reduce(
          (sum, r) => sum + (r.probability || 0),
          0,
        );

        // Pick a random number between 0 and totalProb (or 100)
        const randVal = Math.random() * (totalProb || 100);
        let cumulative = 0;
        let chosenReward = null;

        for (const reward of pool) {
          cumulative += reward.probability || 0;
          if (randVal <= cumulative) {
            chosenReward = reward;
            break;
          }
        }

        if (!chosenReward) {
          chosenReward = pool[0];
        }

        // F. Execute chosen reward
        if (chosenReward.rewardType === "COIN") {
          rewardType = "POINTS";
          const min = chosenReward.minCoins ?? 0;
          const max = chosenReward.maxCoins ?? 0;
          if (max >= min) {
            bonusPoints = Math.floor(Math.random() * (max - min + 1)) + min;
          }
        } else if (chosenReward.rewardType === "BONUS_POINTS") {
          rewardType = "POINTS";
          const min = chosenReward.minPoints ?? 0;
          const max = chosenReward.maxPoints ?? 0;
          if (max >= min) {
            bonusPoints = Math.floor(Math.random() * (max - min + 1)) + min;
          }
        } else if (chosenReward.rewardType === "GIFT" && chosenReward.giftId) {
          chosenGift = await Gift.findById(chosenReward.giftId);
          if (chosenGift && chosenGift.active) {
            // Check reward specific stockLimit if configured
            if (chosenReward.stockLimit > 0) {
              const giftAwardedCount = await Redeem.countDocuments({
                scratchCardCampaignId: matchedCampaign._id,
                scratchCardGiftId: chosenGift._id,
              });
              if (giftAwardedCount >= chosenReward.stockLimit) {
                // Exhausted - fallback to POINTS 0
                rewardType = "POINTS";
                bonusPoints = 0;
                chosenGift = null;
              } else {
                rewardType = "GIFT";
              }
            } else {
              const availableStock =
                chosenGift.stockQuantity - chosenGift.reservedQuantity;
              if (availableStock > 0) {
                rewardType = "GIFT";
              } else {
                rewardType = "POINTS";
                bonusPoints = 0;
                chosenGift = null;
              }
            }
          } else {
            rewardType = "POINTS";
            bonusPoints = 0;
            chosenGift = null;
          }
        }
      } else if (userTierId && mongoose.Types.ObjectId.isValid(userTierId)) {
        // Fallback to legacy Scratch Card Rule (matching tierId directly)
        const tierRules = await ScratchCardRule.find({
          tierId: userTierId,
          active: true,
        }).lean();
        if (tierRules && tierRules.length > 0) {
          const rule = tierRules[Math.floor(Math.random() * tierRules.length)];

          if (rule.rewardType === "GIFT" && rule.giftId) {
            chosenGift = await Gift.findById(rule.giftId);
            const availableStock = chosenGift
              ? chosenGift.stockQuantity - chosenGift.reservedQuantity
              : 0;
            if (chosenGift && chosenGift.active && availableStock > 0) {
              rewardType = "GIFT";
            } else {
              rewardType = "POINTS";
              bonusPoints = 0;
            }
          } else if (rule.rewardType === "POINTS") {
            rewardType = "POINTS";
            const min = rule.minCoins ?? 0;
            const max = rule.maxCoins ?? 0;
            if (max >= min) {
              bonusPoints = Math.floor(Math.random() * (max - min + 1)) + min;
            }
          }
        }
      }

      if (!campaignMatched) {
        // Fallback to existing global configurations
        const configDoc = await AppConfig.findOne().lean();
        const settings = configDoc?.scratchCardSettings;
        const giftProbability = (settings?.giftProbability ?? 50) / 100;
        const hasGiftPool =
          settings?.selectedGiftIds && settings.selectedGiftIds.length > 0;

        let giftQuery = { active: true, stockQuantity: { $gt: 0 } };
        if (hasGiftPool) {
          giftQuery._id = { $in: settings.selectedGiftIds };
        }

        const hasGifts = await Gift.exists(giftQuery);
        if (hasGifts && Math.random() < giftProbability) {
          rewardType = "GIFT";
        }

        if (rewardType === "GIFT") {
          const count = await Gift.countDocuments(giftQuery);
          if (count > 0) {
            const randomIdx = Math.floor(Math.random() * count);
            chosenGift = await Gift.findOne(giftQuery).skip(randomIdx);
          }
          if (!chosenGift) {
            rewardType = "POINTS";
          }
        }

        if (rewardType === "POINTS") {
          const min = settings?.minBonusPoints ?? 0;
          const max = settings?.maxBonusPoints ?? 0;
          if (max >= min) {
            bonusPoints = Math.floor(Math.random() * (max - min + 1)) + min;
          }
        }
      }
    }
  } catch (error) {
    console.error("Error determining scratch card reward:", error);
  }
  // ─────────────────────────────────────────────────────────────────────────

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
    scratchCardRewardType: rewardType,
    scratchCardBonusPoints: rewardType === "POINTS" ? bonusPoints : 0,
    scratchCardGiftId: rewardType === "GIFT" ? chosenGift?._id : null,
    scratchCardCampaignId: matchedCampaign ? matchedCampaign._id : null,
  });
  if (!newRedeem) sendFailResponse("reward redeem failed");

  // update reward status
  reward.isRedeemed = true;
  reward.redeemedAt = new Date();
  reward.redeemedBy = userId;
  reward.active = false;

  // update user atomically
  await User.findByIdAndUpdate(userId, {
    $inc: {
      totalPoints: weightedPoints,
      lifetimePoints: weightedPoints,
      totalScans: 1,
    },
    $set: {
      failedScanAttempts: 0,
      scanBanUntil: null,
    },
  });

  try {
    // 1. First scan milestone
    await referralService.completeMilestone(
      userId,
      REFERRAL_MILESTONES.FIRST_SCAN,
    );

    // 2. Daily scan milestone check
    const todayStr = new Date().toDateString();
    const lastScanStr = user.lastScanDate
      ? new Date(user.lastScanDate).toDateString()
      : "";
    if (todayStr !== lastScanStr) {
      await User.findByIdAndUpdate(userId, {
        $set: { lastScanDate: new Date() },
      });
      await referralService.completeMilestone(
        userId,
        REFERRAL_MILESTONES.DAILY_SCAN,
      );
    }

    // 3. AppConfig scans configuration fallback
    await referralService.evaluateReferralReward(userId, user.totalScans + 1);
  } catch (err) {
    console.error("Error evaluating referral rewards:", err);
  }

  // save reward
  await reward.save();

  // Process QP & Tier Upgrade in loyalty engine
  const updatedProgress = await loyaltyService.processQrScanPoints(
    userId,
    weightedPoints,
    newRedeem._id,
  );
  // Sync user's contest entries with new qualification points (non-blocking)
  const contestsService = require("../contests/contests.service");
  const userTierId =
    updatedProgress?.currentTierId?._id ||
    updatedProgress?.currentTierId ||
    user?.currentTierId;
  contestsService
    .syncUserContestEntries(userId, weightedPoints, actualProductId, userTierId)
    .catch(() => { });
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

  // Award the bonus points dynamically via loyalty engine
  if (showScratchCard && rewardType === "POINTS" && bonusPoints > 0) {
    const { LOYALTY_TRANSACTION_SOURCES } = require("../../constants/loyalty");
    await loyaltyService.addBonusPoints(
      userId,
      bonusPoints,
      `Scratch card bonus points from scan of ${product?.name || "product"}`,
      newRedeem._id,
      {
        skipQpSync: true, // Scratch card bonus points must NOT contribute to tier upgrades
        skipLifetimePoints: true,
        source: LOYALTY_TRANSACTION_SOURCES.SCRATCH_CARD_BONUS,
      },
    );
  }

  // Update in-memory user properties for tracking/testing compatibility
  user.totalPoints =
    (user.totalPoints || 0) +
    weightedPoints +
    (rewardType === "POINTS" ? bonusPoints : 0);
  user.lifetimePoints =
    (user.lifetimePoints || 0) +
    weightedPoints +
    (rewardType === "POINTS" ? bonusPoints : 0);
  user.totalScans = (user.totalScans || 0) + 1;
  user.failedScanAttempts = 0;
  user.scanBanUntil = null;

  const updatedPointsBalance = user.totalPoints || 0;

  return {
    message: "redeem successful",
    data: {
      redeemSuccessful: true,
      showScratchCard,
      rewardType,
      gift: chosenGift
        ? {
          id: chosenGift._id,
          name: chosenGift.name,
          image: chosenGift.image,
        }
        : null,
      pointsRewarded: weightedPoints,
      bonusPoints: rewardType === "POINTS" ? bonusPoints : 0,
      totalPointsAwarded:
        weightedPoints + (rewardType === "POINTS" ? bonusPoints : 0),
      updatedPointsBalance,
      redeemId: newRedeem._id,
      cardBg: bgColor,
      productName: product?.name || null,
      productImage: product?.image || null,
    },
  };
}

async function claimGift(redeemId, claimData, reqUser) {
  const { shippingAddress } = claimData;
  const userId = reqUser._id || reqUser.id;

  const redeem = await Redeem.findById(redeemId);
  if (!redeem) sendFailResponse("Redemption record not found");

  if (String(redeem.userId) !== String(userId)) {
    sendFailResponse("Unauthorized to claim this gift", 403);
  }

  if (redeem.scratchCardRewardType !== "GIFT" || !redeem.scratchCardGiftId) {
    sendFailResponse("This scratch card did not reward a physical gift");
  }

  if (redeem.scratchCardGiftClaimed) {
    sendFailResponse("This gift has already been claimed");
  }

  const gift = await Gift.findById(redeem.scratchCardGiftId);
  if (!gift || !gift.active) {
    sendFailResponse("Gift is no longer available");
  }

  const availableStock = gift.stockQuantity - gift.reservedQuantity;
  if (availableStock <= 0) {
    sendFailResponse("Gift is currently out of stock");
  }

  const session = await mongoose.startSession();
  let resultRedemption;

  try {
    await session.withTransaction(async () => {
      const dbGift = await Gift.findById(gift._id).session(session);
      if (dbGift.stockQuantity - dbGift.reservedQuantity <= 0) {
        throw new Error("Gift is out of stock");
      }

      dbGift.reservedQuantity += 1;
      await dbGift.save({ session });

      const redemption = new GiftRedemption({
        userId,
        giftId: dbGift._id,
        coinsUsed: 0,
        shippingAddress,
      });

      await redemption.save({ session });
      resultRedemption = redemption;

      redeem.scratchCardGiftClaimed = true;
      redeem.scratchCardGiftRedemptionId = redemption._id;
      await redeem.save({ session });
    });
  } catch (error) {
    sendFailResponse(error.message);
  } finally {
    await session.endSession();
  }

  return {
    message: "Gift claimed successfully",
    data: {
      giftRedemptionId: resultRedemption._id,
      status: resultRedemption.status,
      giftName: gift.name,
      giftImage: gift.image,
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
  claimGift,
  deleteRedeem,
};

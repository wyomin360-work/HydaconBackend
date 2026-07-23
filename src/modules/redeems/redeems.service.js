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
const { REWARD_CAUSE } = require("../../constants/gift");
const ScratchCardRule = require("../../schemas/scratch-card-rule.schema");
const { RuleSet } = require("../../schemas/rule-set.schema");
const ruleSetEvaluator = require("../rule-set/rule-set.evaluator");
const mongoose = require("mongoose");
const { attachId, formatNotification } = require("../../utils/heplers");
const { sendFailResponse } = require("../../utils/responseHandlers");
const referralService = require("../referral/referral.service");
const userService = require("../user/user.service");
const loyaltyService = require("../loyalty/loyalty.service");
const TierConfiguration = require("../../schemas/tier-configuration.schema");
const rewardsService = require("../rewards/rewards.service");

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

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — User Validation & Fraud Tracking
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Loads the user by ID (populating roleId for multiplier access) and immediately
 * fails the request if the user does not exist or is under an active scan ban.
 * @param {string} userId
 * @returns {Promise<object>} Populated Mongoose User document
 */
async function validateUserAndBan(userId) {
  const user = await User.findById(userId).populate("roleId");
  if (!user) sendFailResponse("unable to find user");

  if (user.scanBanUntil && new Date(user.scanBanUntil) > new Date()) {
    sendFailResponse(
      "You are temporarily banned from scanning due to repeated invalid attempts. Please try again later.",
      403,
    );
  }
  return user;
}

/**
 * Increments the user's failed scan attempt counter after a bad scan.
 * If the counter reaches the configured limit (default: 8), a 48-hour ban is
 * applied and the counter resets to 0.
 * Called before every sendFailResponse in the reward-validation flow so that
 * fraudulent or repeated invalid scans are penalised.
 * @param {object} user - Mongoose User document
 */
async function trackFraudAttempt(user) {
  user.failedScanAttempts = (user.failedScanAttempts || 0) + 1;

  const config = await AppConfig.findOne().lean();
  if (config?.securitySettings?.autoBanEnabled !== false) {
    const scanLimit = config?.securitySettings?.scanCountForBan || 8;
    if (user.failedScanAttempts >= scanLimit) {
      user.scanBanUntil = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48-hour ban
      user.failedScanAttempts = 0;
    }
  }
  await user.save();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Reward Resolution & Validation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Looks up the Reward document by UID code (the value encoded in the QR/barcode).
 * When both rewardId and rewardUidCode are provided, both must match (extra safety check).
 * Returns null if no matching reward is found.
 * @param {string|null} rewardId      - Optional reward ID to scope the query
 * @param {string}      rewardUidCode - Scanned code value
 * @returns {Promise<object|null>} Mongoose Reward document or null
 */
async function resolveRewardByCode(rewardId, rewardUidCode) {
  if (!rewardUidCode) return null;
  const query = rewardId
    ? { _id: rewardId, uidCode: rewardUidCode }
    : { uidCode: rewardUidCode };
  return Reward.findOne(query);
}

/**
 * Resolves the Reward + Product from the raw request payload, then validates
 * every constraint a reward must satisfy before it can be redeemed:
 *   - Reward exists (by UID code)
 *   - Product exists
 *   - Reward is active and not expired
 *   - Reward has not already been redeemed
 *
 * On any failure: calls trackFraudAttempt (to count the bad attempt) then
 * sendFailResponse (which throws, ending the request).
 *
 * @param {object} redeemData - Raw request payload
 * @param {object} user       - Mongoose User document (for fraud tracking)
 * @returns {{ reward, actualRewardId, actualProductId, product }}
 */
async function resolveAndValidateReward(redeemData, user) {
  const { rewardId, rewardUidCode } = redeemData;
  const now = new Date();

  const reward = await resolveRewardByCode(rewardId, rewardUidCode);
  if (!reward) {
    await trackFraudAttempt(user);
    sendFailResponse("reward not found or invalid code");
  }

  const actualRewardId = reward._id;
  const actualProductId = reward.productId;

  const product = await Product.findById(actualProductId);
  if (!product)        { await trackFraudAttempt(user); sendFailResponse("product not found"); }
  if (!reward.active)  { await trackFraudAttempt(user); sendFailResponse("reward is inactive"); }
  if (new Date(reward.expiresAt) < now) { await trackFraudAttempt(user); sendFailResponse("reward is expired"); }
  if (reward.isRedeemed) { await trackFraudAttempt(user); sendFailResponse("reward already redeemed"); }

  return { reward, actualRewardId, actualProductId, product };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Points Computation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolves the active loyalty season and computes the final weighted point value
 * for this scan by applying two multipliers to the reward's base points:
 *   - tierMultiplier  — from TierConfiguration for the user's current season tier
 *   - roleMultiplier  — from the user's Role (e.g. distributor earns 1.5×)
 *
 * @param {object} reward     - Mongoose Reward document
 * @param {object} user       - Mongoose User document (roleId populated)
 * @param {string} userId
 * @returns {{ weightedPoints: number, activeSeason: object|null }}
 */
async function computeWeightedPoints(reward, user, userId) {
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

  const roleMultiplier = user.roleId?.pointMultiplier || 1;
  const weightedPoints = Math.round((reward?.point || 0) * roleMultiplier * tierMultiplier);

  return { weightedPoints, activeSeason };
}

/**
 * Extracts the scanner's identity from the authenticated request user.
 * Used when an admin or distributor scans on behalf of a customer — the
 * scanner's role and ID are stored on the Redeem document for audit purposes.
 * Returns null values when the scan is self-initiated (no scanner context).
 * @param {object|null} reqUser - The authenticated user making the HTTP request
 * @returns {{ scannerId: string|null, scannerRole: string|null }}
 */
function extractScannerInfo(reqUser) {
  if (!reqUser) return { scannerId: null, scannerRole: null };
  return {
    scannerId: reqUser._id || reqUser.id,
    scannerRole: reqUser.roleId?.name || reqUser.role || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Scratch Card Reward Decision
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TEST OVERRIDE PATH — unit tests only.
 * When redeemData.testRewardType is set, bypasses all campaign/tier logic and
 * uses AppConfig to find a random available gift (for "GIFT") or compute bonus
 * points from the min/max range (for "POINTS").
 * @param {object} redeemData
 * @returns {Promise<{ rewardType, bonusPoints, chosenGift, matchedCampaign: null }>}
 */
async function resolveTestReward(redeemData) {
  let rewardType = redeemData.testRewardType;
  let bonusPoints = 0;
  let chosenGift = null;

  if (rewardType === "GIFT") {
    const configDoc = await AppConfig.findOne().lean();
    const settings = configDoc?.scratchCardSettings;
    const giftQuery = { active: true, stockQuantity: { $gt: 0 } };
    if (settings?.selectedGiftIds?.length > 0) giftQuery._id = { $in: settings.selectedGiftIds };

    const count = await Gift.countDocuments(giftQuery);
    if (count > 0) chosenGift = await Gift.findOne(giftQuery).skip(Math.floor(Math.random() * count));
    if (!chosenGift) rewardType = "POINTS";
  }

  if (rewardType === "POINTS") {
    const configDoc = await AppConfig.findOne().lean();
    const settings = configDoc?.scratchCardSettings;
    const min = settings?.minBonusPoints ?? 0;
    const max = settings?.maxBonusPoints ?? 0;
    if (max >= min) bonusPoints = Math.floor(Math.random() * (max - min + 1)) + min;
  }

  return { rewardType, bonusPoints, chosenGift, matchedCampaign: null };
}

/**
 * Checks whether a single ScratchCardRule campaign is eligible for the current
 * user and scan. All four gates must pass for the campaign to be considered:
 *   A. Date window — campaign must be currently active
 *   B. RuleSet eligibility — user must satisfy any attached ruleset
 *   C. Total scratch limit — campaign-wide cap not yet reached
 *   D. Per-user scratch limit — user has not exceeded their personal cap
 *
 * @param {object} campaign        - ScratchCardRule document (lean)
 * @param {object} user            - Mongoose User document
 * @param {string} userId
 * @param {string} actualProductId
 * @returns {Promise<boolean>} true if all gates pass
 */
async function isCampaignEligible(campaign, user, userId, actualProductId) {
  const now = new Date();

  // A. Date window
  if (campaign.startDate && new Date(campaign.startDate) > now) return false;
  if (campaign.endDate   && new Date(campaign.endDate)   < now) return false;

  // B. RuleSet eligibility (optional — campaigns without a ruleSetId pass automatically)
  if (campaign.ruleSetId) {
    const ruleSet = await RuleSet.findById(campaign.ruleSetId);
    if (ruleSet) {
      const evaluation = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet, user, { targetId: campaign._id, productId: actualProductId },
      );
      if (!evaluation.eligible) return false;
    }
  }

  // C. Total campaign scratch limit
  if (campaign.totalScratchLimit > 0) {
    const totalScans = await Redeem.countDocuments({ scratchCardCampaignId: campaign._id });
    if (totalScans >= campaign.totalScratchLimit) return false;
  }

  // D. Per-user scratch limit
  if (campaign.perUserScratchLimit > 0) {
    const userScans = await Redeem.countDocuments({ userId, scratchCardCampaignId: campaign._id });
    if (userScans >= campaign.perUserScratchLimit) return false;
  }

  return true;
}

/**
 * Iterates all active ScratchCardRule campaigns (ordered by DB insertion) and
 * returns the first one the user qualifies for.
 * Returns null when no campaign matches — callers fall back to legacy tier rules
 * or the global AppConfig probability.
 * @param {object} user
 * @param {string} userId
 * @param {string} actualProductId
 * @returns {Promise<object|null>} First matching campaign (lean) or null
 */
async function matchActiveCampaign(user, userId, actualProductId) {
  const campaigns = await ScratchCardRule.find({ active: true }).lean();
  for (const campaign of campaigns) {
    const eligible = await isCampaignEligible(campaign, user, userId, actualProductId);
    if (eligible) return campaign;
  }
  return null;
}

/**
 * Picks one reward entry from a matched campaign's reward pool using weighted
 * random probability, then resolves it to concrete output values.
 *
 * Reward type mapping:
 *   COIN / BONUS_POINTS → rewardType="POINTS", bonusPoints from configured range
 *   GIFT                → rewardType="GIFT" if stock/stockLimit allows, else "POINTS"
 *
 * @param {object} campaign - Matched ScratchCardRule document
 * @param {string} userId   - Needed for per-gift awarded-count check
 * @returns {Promise<{ rewardType, bonusPoints, chosenGift }>}
 */
async function selectCampaignReward(campaign, userId) {
  const pool = campaign.rewards;
  let rewardType = "POINTS";
  let bonusPoints = 0;
  let chosenGift = null;

  // Weighted-random selection: accumulate probabilities and pick on first threshold hit
  const totalProb = pool.reduce((sum, r) => sum + (r.probability || 0), 0);
  const randVal = Math.random() * (totalProb || 100);
  let cumulative = 0;
  let chosenReward = null;

  for (const r of pool) {
    cumulative += r.probability || 0;
    if (randVal <= cumulative) { chosenReward = r; break; }
  }
  if (!chosenReward) chosenReward = pool[0]; // safety fallback if rounding misses

  // Resolve chosen reward entry to concrete values
  if (chosenReward.rewardType === "COIN") {
    rewardType = "POINTS";
    const min = chosenReward.minCoins ?? 0;
    const max = chosenReward.maxCoins ?? 0;
    if (max >= min) bonusPoints = Math.floor(Math.random() * (max - min + 1)) + min;

  } else if (chosenReward.rewardType === "BONUS_POINTS") {
    rewardType = "POINTS";
    const min = chosenReward.minPoints ?? 0;
    const max = chosenReward.maxPoints ?? 0;
    if (max >= min) bonusPoints = Math.floor(Math.random() * (max - min + 1)) + min;

  } else if (chosenReward.rewardType === "GIFT" && chosenReward.giftId) {
    chosenGift = await Gift.findById(chosenReward.giftId);
    if (chosenGift && chosenGift.active) {
      if (chosenReward.stockLimit > 0) {
        // Per-campaign gift cap: count how many times this gift was already awarded
        const awardedCount = await Redeem.countDocuments({
          scratchCardCampaignId: campaign._id,
          scratchCardGiftId: chosenGift._id,
        });
        rewardType = awardedCount >= chosenReward.stockLimit ? "POINTS" : "GIFT";
      } else {
        // General stock check: stockQuantity minus already-reserved slots
        rewardType = (chosenGift.stockQuantity - chosenGift.reservedQuantity) > 0 ? "GIFT" : "POINTS";
      }
      if (rewardType === "POINTS") { bonusPoints = 0; chosenGift = null; }
    } else {
      rewardType = "POINTS"; bonusPoints = 0; chosenGift = null;
    }
  }

  return { rewardType, bonusPoints, chosenGift };
}

/**
 * LEGACY FALLBACK — resolves a reward using the old tier-based ScratchCardRule
 * schema where rules are matched by tierId rather than via campaign logic.
 * Used when no active campaign matches the user.
 * Returns null when no tier rules exist for this user.
 * @param {string} userTierId - The user's current tier ObjectId
 * @returns {Promise<{ rewardType, bonusPoints, chosenGift }|null>}
 */
async function resolveLegacyTierReward(userTierId) {
  const tierRules = await ScratchCardRule.find({ tierId: userTierId, active: true }).lean();
  if (!tierRules?.length) return null;

  const rule = tierRules[Math.floor(Math.random() * tierRules.length)];
  let rewardType = "POINTS";
  let bonusPoints = 0;
  let chosenGift = null;

  if (rule.rewardType === "GIFT" && rule.giftId) {
    chosenGift = await Gift.findById(rule.giftId);
    const available = chosenGift ? chosenGift.stockQuantity - chosenGift.reservedQuantity : 0;
    if (chosenGift && chosenGift.active && available > 0) {
      rewardType = "GIFT";
    } else {
      rewardType = "POINTS"; chosenGift = null;
    }
  } else if (rule.rewardType === "POINTS") {
    const min = rule.minCoins ?? 0;
    const max = rule.maxCoins ?? 0;
    if (max >= min) bonusPoints = Math.floor(Math.random() * (max - min + 1)) + min;
  }

  return { rewardType, bonusPoints, chosenGift };
}

/**
 * GLOBAL CONFIG FALLBACK — used when no campaign and no legacy tier rule applies.
 * Reads AppConfig.scratchCardSettings to determine whether to award a gift or points:
 *   - giftProbability controls the GIFT vs POINTS split
 *   - selectedGiftIds scopes which gifts are eligible (empty = all active gifts)
 *   - minBonusPoints / maxBonusPoints bound the POINTS range
 * @returns {Promise<{ rewardType, bonusPoints, chosenGift }>}
 */
async function resolveGlobalConfigReward() {
  const configDoc = await AppConfig.findOne().lean();
  const settings = configDoc?.scratchCardSettings;
  const giftProbability = (settings?.giftProbability ?? 50) / 100;

  const giftQuery = { active: true, stockQuantity: { $gt: 0 } };
  if (settings?.selectedGiftIds?.length > 0) giftQuery._id = { $in: settings.selectedGiftIds };

  let rewardType = "POINTS";
  let bonusPoints = 0;
  let chosenGift = null;

  const hasGifts = await Gift.exists(giftQuery);
  if (hasGifts && Math.random() < giftProbability) {
    rewardType = "GIFT";
    const count = await Gift.countDocuments(giftQuery);
    if (count > 0) chosenGift = await Gift.findOne(giftQuery).skip(Math.floor(Math.random() * count));
    if (!chosenGift) rewardType = "POINTS"; // pool check passed but no document returned
  }

  if (rewardType === "POINTS") {
    const min = settings?.minBonusPoints ?? 0;
    const max = settings?.maxBonusPoints ?? 0;
    if (max >= min) bonusPoints = Math.floor(Math.random() * (max - min + 1)) + min;
  }

  return { rewardType, bonusPoints, chosenGift };
}

/**
 * Top-level scratch card reward resolver. Routes through decision paths in priority order:
 *   1. Test override  (redeemData.testRewardType set — unit tests only)
 *   2. Active campaign match → weighted reward selection from campaign pool
 *   3. Legacy tier-based rule (ScratchCardRule.tierId) — no campaign matched
 *   4. Global AppConfig probability — final fallback
 *
 * Any unexpected error is caught, logged, and returns POINTS:0 so the scan never fails.
 *
 * @param {{ userId, user, actualProductId, activeSeason, redeemData }} ctx
 * @returns {Promise<{ rewardType, bonusPoints, chosenGift, matchedCampaign }>}
 */
async function resolveScratchCardReward({ userId, user, actualProductId, activeSeason, redeemData }) {
  try {
    // Path 1: Unit-test override
    if (redeemData.testRewardType) return resolveTestReward(redeemData);

    // Resolve the user's current tier ID (needed for legacy fallback)
    let userTierId = null;
    if (activeSeason) {
      const userProgress = await loyaltyService.getOrCreateUserProgress(userId);
      if (userProgress) userTierId = userProgress.currentTierId?._id || userProgress.currentTierId;
    }
    if (!userTierId && user.currentTierId) {
      userTierId = user.currentTierId?._id || user.currentTierId;
    }

    // Path 2: Active campaign match
    const matchedCampaign = await matchActiveCampaign(user, userId, actualProductId);
    if (matchedCampaign?.rewards?.length > 0) {
      const result = await selectCampaignReward(matchedCampaign, userId);
      return { ...result, matchedCampaign };
    }

    // Path 3: Legacy tier-based rule
    if (userTierId && mongoose.Types.ObjectId.isValid(userTierId)) {
      const tierResult = await resolveLegacyTierReward(userTierId);
      if (tierResult) return { ...tierResult, matchedCampaign: null };
    }

    // Path 4: Global AppConfig probability fallback
    const globalResult = await resolveGlobalConfigReward();
    return { ...globalResult, matchedCampaign: null };

  } catch (error) {
    console.error("[Scratch Card] Error determining reward:", error);
    return { rewardType: "POINTS", bonusPoints: 0, chosenGift: null, matchedCampaign: null };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — Transactional Persistence
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates the Redeem document inside an active MongoDB session/transaction.
 * Redeem.create([doc], {session}) returns an array; we unwrap to the first element.
 * Immediately fails the request (sendFailResponse) if no document is returned.
 *
 * @param {object} payload    - All fields needed to build the Redeem document
 * @param {ClientSession} session
 * @returns {Promise<object>} Created Redeem document
 */
async function persistRedeemRecord(payload, session) {
  const {
    userId, actualProductId, actualRewardId, rewardUidCode,
    weightedPoints, location, bgColor, scannerRole, scannerId,
    rewardType, bonusPoints, chosenGift, matchedCampaign,
  } = payload;

  let redeem = await Redeem.create(
    [
      {
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
      },
    ],
    { session },
  );

  redeem = Array.isArray(redeem) ? redeem[0] : redeem;
  if (!redeem) sendFailResponse("reward redeem failed");
  return redeem;
}

/**
 * Handles the gift side of a scratch card win inside the active transaction.
 * Delegates actual voucher delivery or physical gift reservation to rewardsService.awardRewardToUser.
 *
 * @param {{ userId, redeem, chosenGift, matchedCampaign }} ctx
 * @param {ClientSession} session
 */
async function handleScratchCardGiftAward({ userId, redeem, chosenGift, matchedCampaign }, session) {
  if (!chosenGift || redeem.scratchCardRewardType !== "GIFT") return;
  const rewardDetails = {
    type: "GIFT",
    giftId: chosenGift._id,
  };

  const sourceDetails = {
    cause: "SCRATCH_CARD",
    causeId: matchedCampaign ? matchedCampaign._id : null,
    causeTitle: matchedCampaign ? `Scratch & Win: ${matchedCampaign.name}` : "Scratch Card Win",
    referenceId: redeem._id,
  };

  const awardResult = await rewardsService.awardRewardToUser(
    userId,
    rewardDetails,
    sourceDetails,
    session
  );

  if (awardResult.success) {
    if (!awardResult.requiresClaim) {
      redeem.scratchCardGiftRedemptionId = awardResult.giftRedemptionId;
      if (typeof redeem.save === "function") {
        await redeem.save({ session });
      }
    }
  } else {
    // Fallback to POINTS: 0
    console.warn(`[Scratch Card] Could not award gift ${chosenGift._id}: ${awardResult.message}`);
    redeem.scratchCardRewardType = "POINTS";
    redeem.scratchCardBonusPoints = 0;
    redeem.scratchCardGiftId = null;
    if (typeof redeem.save === "function") {
      await redeem.save({ session });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — Post-Transaction Actions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Marks the Reward document as redeemed so it cannot be scanned again.
 * Called after the transaction commits — the Redeem record already exists as
 * proof of the scan, so this is safe to do outside the transaction.
 * @param {object} reward - Mongoose Reward document
 * @param {string} userId - Who redeemed it
 */
async function finalizeReward(reward, userId) {
  reward.isRedeemed = true;
  reward.redeemedAt = new Date();
  reward.redeemedBy = userId;
  reward.active = false;
  await reward.save();
}

/**
 * Sends a push notification to all of the user's registered FCM tokens to confirm
 * the successful scan and show how many points were earned.
 * This is intentionally fire-and-forget — an FCM failure must never block the response.
 * @param {object}      user          - Mongoose User document (needs fcmTokens, enableNotification)
 * @param {number}      weightedPoints
 * @param {string|null} productName
 */
function sendScanSuccessNotification(user, weightedPoints, productName) {
  if (!user?.fcmTokens?.length || !user?.enableNotification) return;
  const rewardNotification = APP_NOTIFICATIONS.rewards;
  sendFcmNotifications(
    user.fcmTokens,
    rewardNotification.qrScanSuccess.title,
    formatNotification(rewardNotification.qrScanSuccess.body, { coins: weightedPoints, productName }),
  ).catch(() => { }); // fire-and-forget
}

/**
 * Syncs the in-memory user object's point totals and scan counters to reflect
 * what was just persisted. Kept for test-suite compatibility — tests inspect
 * user.totalPoints, user.totalScans, etc. after createRedeem returns.
 * @param {object} user
 * @param {number} weightedPoints
 * @param {string} rewardType     - Final reward type from the persisted Redeem
 * @param {number} bonusPoints    - Final bonus points from the persisted Redeem
 */
function syncUserInMemoryState(user, weightedPoints, rewardType, bonusPoints) {
  const bonus = rewardType === "POINTS" ? bonusPoints : 0;
  user.totalPoints    = (user.totalPoints    || 0) + weightedPoints + bonus;
  user.lifetimePoints = (user.lifetimePoints || 0) + weightedPoints + bonus;
  user.totalScans       = (user.totalScans       || 0) + 1;
  user.failedScanAttempts = 0;
  user.scanBanUntil       = null;
}

/**
 * Builds the final API response shape for a successful scan.
 * Reads rewardType and bonusPoints from the persisted Redeem document (not the
 * pre-transaction scratch result) because the gift award may have been downgraded
 * to POINTS:0 during the transaction if stock ran out.
 * @param {object} newRedeem    - Persisted Redeem document
 * @param {object} scratchResult - { chosenGift, ... } — used for gift metadata in response
 * @param {number} weightedPoints
 * @param {object} user
 * @param {object} product
 * @param {string} bgColor
 * @returns {object} API response payload
 */
function buildRedeemResponse(newRedeem, scratchResult, weightedPoints, user, product, bgColor) {
  const { chosenGift } = scratchResult;
  const finalRewardType  = newRedeem.scratchCardRewardType;
  const finalBonusPoints = finalRewardType === "POINTS" ? newRedeem.scratchCardBonusPoints : 0;

  return {
    message: "redeem successful",
    data: {
      redeemSuccessful: true,
      showScratchCard: true,
      rewardType: finalRewardType,
      gift: newRedeem.scratchCardGiftId
        ? {
          id: newRedeem.scratchCardGiftId,
          name: chosenGift?.name,
          image: chosenGift?.image,
          giftType: chosenGift?.giftType,
          // Physical gifts: user must provide a shipping address via POST /gifts/user/redeem
          requiresClaim: chosenGift?.giftType === "physical",
        }
        : null,
      pointsRewarded: weightedPoints,
      bonusPoints: finalBonusPoints,
      totalPointsAwarded: weightedPoints + finalBonusPoints,
      updatedPointsBalance: user.totalPoints || 0,
      redeemId: newRedeem._id,
      cardBg: bgColor,
      productName: product?.name || null,
      productImage: product?.image || null,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — createRedeem Orchestrator
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main entry point for scanning a reward QR/barcode.
 * Orchestrates the full scan pipeline by delegating each responsibility to a
 * focused helper function defined above.
 *
 * @param {object}      redeemData - { userId, productId, rewardId, rewardUidCode, location, testRewardType? }
 * @param {object|null} reqUser    - Authenticated user making the request (scanner context)
 * @returns {Promise<object>} Scan result response
 */
async function createRedeem(redeemData, reqUser = null) {
  const { userId, rewardUidCode, location } = redeemData;
  const bgColor = LIGHT_CARD_COLORS[Math.floor(Math.random() * LIGHT_CARD_COLORS.length)];

  // 1. Validate user + check scan ban
  const user = await validateUserAndBan(userId);

  // 2. Resolve and validate the scanned reward (fraud-counted on any failure)
  const { reward, actualRewardId, actualProductId, product } =
    await resolveAndValidateReward(redeemData, user);

  // 3. Compute weighted scan points (tier × role multipliers)
  const { weightedPoints, activeSeason } = await computeWeightedPoints(reward, user, userId);

  // 4. Extract scanner identity (admin/distributor scanning on behalf of user)
  const { scannerRole, scannerId } = extractScannerInfo(reqUser);

  // 5. Determine scratch card reward: campaign → legacy tier → global config
  const scratchResult = await resolveScratchCardReward({
    userId, user, actualProductId, activeSeason, redeemData,
  });
  const { rewardType, bonusPoints, chosenGift, matchedCampaign } = scratchResult;

  // 6. Atomic transaction: persist Redeem record + handle gift award together
  const session = await mongoose.startSession();
  let newRedeem;
  try {
    await session.withTransaction(async () => {
      newRedeem = await persistRedeemRecord({
        userId, actualProductId, actualRewardId, rewardUidCode,
        weightedPoints, location, bgColor, scannerRole, scannerId,
        rewardType, bonusPoints, chosenGift, matchedCampaign,
      }, session);

      await handleScratchCardGiftAward(
        { userId, redeem: newRedeem, chosenGift, matchedCampaign },
        session,
      );
    });
  } catch (err) {
    throw err;
  } finally {
    await session.endSession();
  }

  if (!newRedeem) sendFailResponse("reward redeem failed");

  // 7–12. Post-transaction side-effects (run sequentially after the commit)
  await finalizeReward(reward, userId);
  await userService.creditUserScanPoints(userId, weightedPoints);
  await referralService.handleScanReferralMilestones(userId, user);
  await loyaltyService.processLoyaltyAndContestsAfterScan(
    userId,
    weightedPoints,
    newRedeem._id,
    actualProductId,
    user?.currentTierId
  );
  sendScanSuccessNotification(user, weightedPoints, product?.name); // fire-and-forget

  if (newRedeem.scratchCardRewardType === "POINTS" && newRedeem.scratchCardBonusPoints > 0) {
    await rewardsService.awardRewardToUser(
      userId,
      { type: "POINTS", amount: newRedeem.scratchCardBonusPoints },
      {
        cause: "SCRATCH_CARD",
        causeId: matchedCampaign ? matchedCampaign._id : null,
        causeTitle: `Scratch card bonus points from scan of ${product?.name || "product"}`,
        referenceId: newRedeem._id,
      }
    );
  }

  // 13. Keep in-memory user state in sync (for test-suite assertions)
  syncUserInMemoryState(user, weightedPoints, newRedeem.scratchCardRewardType, newRedeem.scratchCardBonusPoints);

  return buildRedeemResponse(newRedeem, scratchResult, weightedPoints, user, product, bgColor);
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


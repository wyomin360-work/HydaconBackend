const ScratchCard = require("../../schemas/scratch-card.schema");
const Gift = require("../../schemas/gift.schema");
const rewardsService = require("../rewards/rewards.service");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { attachId } = require("../../utils/heplers");
const Redeem = require("../../schemas/redeem.schema");
const ScratchCardRule = require("../../schemas/scratch-card-rule.schema");
const { REWARD_CAUSE } = require("../../constants/gift");
const {
  SCRATCH_CARD_STATUS,
  SCRATCH_CARD_REWARD_TYPE,
  SCRATCH_CARD_MESSAGES,
  SCRATCH_CARD_ERRORS,
  SCRATCH_CARD_TITLES,
} = require("../../constants/scratch-cards");

/**
 * Lists scratch cards for a specific user.
 *
 * @param {object} data
 * @returns {Promise<object>}
 */
async function listScratchCards(data, isAdmin = false) {
  const { userId, page = 1, limit = 15, startDate, endDate, scratchCardCampaignId } = data;
  const skip = (page - 1) * limit;

  const query = {};
  if (userId) query.userId = userId;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  if (scratchCardCampaignId) {

    const redeems = await Redeem.find({ scratchCardCampaignId }).select("_id").lean();
    const redeemIds = redeems.map(r => r._id);
    query.redeemId = { $in: redeemIds };
  }

  const scratchCardsQuery = ScratchCard.find(query)
    .populate({
      path: "redeemId",
      select:
        "scratchCardGiftClaimed scratchCardGiftRedemptionId scratchCardRewardType scratchCardBonusPoints scratchCardGiftId productId product scratchCardCampaignId",
      populate: [
        { path: "product", select: "name image" },
        {
          path: "scratchCardGiftRedemptionId",
          select: "status trackingNumber courierName shippingAddress createdAt",
        },
        { path: "scratchCardCampaignId", select: "name _id" },
      ],
    })
    .populate({
      path: "giftId",
      select: "name image giftType active priceInCoins",
    })
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  if (isAdmin) {
    scratchCardsQuery.populate({
      path: "userId",
      select: "name phone email uidId id",
    });
  }

  const scratchCards = await scratchCardsQuery.lean();

  const scratchCardsWithId = attachId(scratchCards).map((card) => {
    const isGift = card.rewardType === "GIFT" || !!card.giftId;
    const isClaimed = Boolean(
      card.redeemId?.scratchCardGiftClaimed ||
      card.redeemId?.scratchCardGiftRedemptionId,
    );

    const effectivePoints =
      card.points > 0
        ? card.points
        : card.redeemId?.scratchCardBonusPoints ||
          card.redeemId?.weightedPoints ||
          card.points ||
          0;

    return {
      ...card,
      points: effectivePoints,
      isGift,
      isClaimed,
      scratchCardGiftClaimed: isClaimed,
    };
  });

  const totalDocuments = await ScratchCard.countDocuments(query);

  return {
    data: {
      scratchCards: scratchCardsWithId,
      page,
      limit,
      totalPages: Math.ceil(totalDocuments / limit),
      total: totalDocuments,
    },
  };
}

/**
 * Marks a scratch card as scratched and awards points/rewards immediately.
 *
 * @param {string} scratchCardId
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function scratchCard(scratchCardId, userId) {
  const card = await ScratchCard.findById(scratchCardId).populate("redeemId");

  if (!card) sendFailResponse(SCRATCH_CARD_ERRORS.NOT_FOUND, 404);
  if (card.userId.toString() !== userId.toString()) {
    sendFailResponse(SCRATCH_CARD_ERRORS.UNAUTHORIZED, 403);
  }
  if (card.status === SCRATCH_CARD_STATUS.SCRATCHED) {
    sendFailResponse(SCRATCH_CARD_ERRORS.ALREADY_SCRATCHED, 400);
  }

  card.status = SCRATCH_CARD_STATUS.SCRATCHED;
  card.scratchedAt = new Date();
  await card.save();

  // If reward type is POINTS or COIN, award them immediately to the user's wallet
  if (card.rewardType === SCRATCH_CARD_REWARD_TYPE.POINTS && card.points > 0) {
    const scratchCardBonusTitle = SCRATCH_CARD_TITLES.BONUS_POINTS;

    await rewardsService.awardRewardToUser(
      userId,
      { type: SCRATCH_CARD_REWARD_TYPE.POINTS, amount: card.points },
      {
        cause: REWARD_CAUSE.SCRATCH_CARD,
        causeId: card.redeemId?.scratchCardCampaignId || null,
        causeTitle: scratchCardBonusTitle,
        referenceId: card.redeemId?._id || null,
      },
    );
  } else if (
    (card.rewardType === SCRATCH_CARD_REWARD_TYPE.COIN ||
      card.rewardType === "COIN" ||
      card.rewardType === "HYDACOIN") &&
    card.points > 0
  ) {
    await rewardsService.awardRewardToUser(
      userId,
      { type: "COIN", amount: card.points },
      {
        cause: REWARD_CAUSE.SCRATCH_CARD,
        causeId: card.redeemId?.scratchCardCampaignId || null,
        causeTitle: "Scratch Card Bonus Hydacon Coins",
        referenceId: card.redeemId?._id || null,
      },
    );
  }

  return {
    success: true,
    message: SCRATCH_CARD_MESSAGES.SCRATCH_SUCCESS,
    data: card,
  };
}

/**
 * CRON TASK HANDLER: Finds expired unscratched gift cards & unclaimed gift reservations (10 days) and releases reserved stock back.
 */
async function releaseExpiredScratchCardGifts() {
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

  // 1. Find gift scratch cards that are still UNSCRATCHED and older than 10 days
  const expiredCards = await ScratchCard.find({
    status: SCRATCH_CARD_STATUS.UNSCRATCHED,
    rewardType: SCRATCH_CARD_REWARD_TYPE.GIFT,
    createdAt: { $lt: tenDaysAgo },
  }).lean();

  let count = 0;
  for (const card of expiredCards) {
    const updated = await ScratchCard.updateOne(
      { _id: card._id, status: SCRATCH_CARD_STATUS.UNSCRATCHED },
      { $set: { status: "EXPIRED" } },
    );

    if (updated.modifiedCount > 0 && card.giftId) {
      await Gift.updateOne(
        { _id: card.giftId, reservedQuantity: { $gt: 0 } },
        { $inc: { reservedQuantity: -1 } },
      );
      count++;
    }
  }

  // 2. Clean up unclaimed entries in Gift.rewardedUsers array older than 10 days / expiresAt < now
  const now = new Date();
  const giftsWithExpiredUsers = await Gift.find({
    "rewardedUsers.expiresAt": { $lt: now },
  }).lean();

  for (const g of giftsWithExpiredUsers) {
    const expiredEntries = (g.rewardedUsers || []).filter(
      (u) => u.expiresAt && new Date(u.expiresAt) < now,
    );
    if (expiredEntries.length > 0) {
      await Gift.updateOne(
        { _id: g._id },
        {
          $pull: { rewardedUsers: { expiresAt: { $lt: now } } },
          $inc: {
            reservedQuantity: -Math.min(
              g.reservedQuantity || 0,
              expiredEntries.length,
            ),
          },
        },
      );
      count += expiredEntries.length;
    }
  }

  return { processed: count };
}

module.exports = {
  listScratchCards,
  scratchCard,
  releaseExpiredScratchCardGifts,
};

const ScratchCard = require("../../schemas/scratch-card.schema");
const rewardsService = require("../rewards/rewards.service");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { attachId } = require("../../utils/heplers");
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
async function listScratchCards(data) {
  const { userId, page = 1, limit = 15 } = data;
  const skip = (page - 1) * limit;

  const query = { userId };

  const scratchCards = await ScratchCard.find(query)
    .populate({
      path: "redeemId",
      select:
        "scratchCardGiftClaimed scratchCardGiftRedemptionId scratchCardRewardType scratchCardBonusPoints scratchCardGiftId product",
      populate: [
        { path: "product", select: "name image" },
        {
          path: "scratchCardGiftRedemptionId",
          select: "status trackingNumber courierName shippingAddress createdAt",
        },
      ],
    })
    .populate({
      path: "giftId",
      select: "name image giftType active priceInCoins",
    })
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();

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

module.exports = {
  listScratchCards,
  scratchCard,
};

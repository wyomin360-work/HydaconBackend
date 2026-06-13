const mongoose = require("mongoose");
const ScratchCardCampaign = require("../../schemas/scratch-card-campaign.schema");
const ScratchCard = require("../../schemas/scratch-card.schema");
const User = require("../../schemas/user.schema");
const Gift = require("../../schemas/gift.schema");
const GiftRedemption = require("../../schemas/gift-redemption.schema");
const LoyaltyTransaction = require("../../schemas/loyalty-transaction.schema");
const { LOYALTY_TRANSACTION_TYPES, LOYALTY_TRANSACTION_SOURCES } = require("../../constants/loyalty");
const { sendFcmNotifications } = require("../../functions/fcm");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const { formatNotification } = require("../../utils/heplers");

// Admin Functions

exports.createCampaign = async (data) => {
  try {
    const campaign = new ScratchCardCampaign(data);
    await campaign.save();
    return { success: true, message: "Campaign created successfully", data: campaign };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.updateCampaign = async (campaignId, data) => {
  try {
    const campaign = await ScratchCardCampaign.findByIdAndUpdate(campaignId, data, { new: true });
    if (!campaign) return { success: false, message: "Campaign not found" };
    return { success: true, message: "Campaign updated successfully", data: campaign };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.listCampaigns = async (data) => {
  try {
    const { page = 1, limit = 10, search = "" } = data;
    const skip = (page - 1) * limit;
    let query = {};
    if (search) query.name = { $regex: search, $options: "i" };

    const campaigns = await ScratchCardCampaign.find(query)
      .populate("eligibleProducts", "name")
      .populate("rewardPool.giftId", "name image")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await ScratchCardCampaign.countDocuments(query);
    return {
      success: true,
      data: {
        records: campaigns,
        total,
        totalPages: Math.ceil(total / limit),
        page,
        limit,
      },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.getCampaignById = async (campaignId) => {
  try {
    const campaign = await ScratchCardCampaign.findById(campaignId)
      .populate("eligibleProducts", "name")
      .populate("rewardPool.giftId", "name image");
    if (!campaign) return { success: false, message: "Campaign not found" };
    return { success: true, data: campaign };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.deleteCampaign = async (campaignId) => {
  try {
    const campaign = await ScratchCardCampaign.findByIdAndDelete(campaignId);
    if (!campaign) return { success: false, message: "Campaign not found" };
    return { success: true, message: "Campaign deleted successfully" };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.getCampaignStats = async (campaignId) => {
  try {
    const totalGenerated = await ScratchCard.countDocuments({ campaignId });
    const totalRevealed = await ScratchCard.countDocuments({ campaignId, status: "REVEALED" });
    
    const rewardsDistributed = await ScratchCard.aggregate([
      { $match: { campaignId: new mongoose.Types.ObjectId(campaignId), status: "REVEALED" } },
      { $group: { _id: "$rewardType", count: { $sum: 1 }, totalPoints: { $sum: "$pointsAmount" } } }
    ]);

    return {
      success: true,
      data: {
        totalGenerated,
        totalRevealed,
        rewardsDistributed
      }
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// User Functions

exports.listUserScratchCards = async (userId, data) => {
  try {
    const { page = 1, limit = 10, status } = data;
    const skip = (page - 1) * limit;
    let query = { userId };
    if (status) query.status = status;

    const cards = await ScratchCard.find(query)
      .populate("giftId", "name image")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await ScratchCard.countDocuments(query);
    return {
      success: true,
      data: {
        records: cards,
        total,
        totalPages: Math.ceil(total / limit),
        page,
        limit,
      },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.revealScratchCard = async (userId, scratchCardId) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const card = await ScratchCard.findOne({ _id: scratchCardId, userId }).session(session);
      if (!card) throw new Error("Scratch card not found");
      if (card.status !== "UNREVEALED") throw new Error(`Scratch card is already ${card.status}`);
      if (card.expiresAt && new Date() > card.expiresAt) {
        card.status = "EXPIRED";
        await card.save({ session });
        throw new Error("Scratch card has expired");
      }

      if (card.rewardType === "POINTS") {
        const user = await User.findById(userId).session(session);
        if (!user) throw new Error("User not found");
        
        user.totalPoints += card.pointsAmount;
        // NOTE: We do not call processQrScanPoints so it bypasses tier upgrades as requested.
        await user.save({ session });

        const loyaltyTx = new LoyaltyTransaction({
          userId,
          points: card.pointsAmount,
          type: LOYALTY_TRANSACTION_TYPES.ADDITION,
          source: LOYALTY_TRANSACTION_SOURCES.QR_SCAN, // or a new source like SCRATCH_CARD if added
          description: "Scratch Card Bonus Points",
          referenceId: card._id
        });
        await loyaltyTx.save({ session });
      } else if (card.rewardType === "GIFT") {
        const gift = await Gift.findById(card.giftId).session(session);
        if (!gift) throw new Error("Gift not found");

        // "treat them as gift purchased through hydacon coin and got approved"
        const redemption = new GiftRedemption({
          userId,
          giftId: card.giftId,
          coinsUsed: 0, // Bonus physical gift, costs 0 coins
          status: "Approved",
          shippingAddress: null // Can be updated later by user
        });
        await redemption.save({ session });
        
        // Ensure stock is deducted
        if (gift.stockQuantity > 0) {
           gift.stockQuantity -= 1;
           await gift.save({ session });
        }
        
        card.giftRedemptionId = redemption._id;
      }

      card.status = "REVEALED";
      card.revealedAt = new Date();
      await card.save({ session });
      result = card;
    });

    // Send push notification for reward outside the transaction (so it only sends on successful commit)
    if (result && result.rewardType !== "NONE") {
      const userToNotify = await User.findById(userId);
      if (userToNotify?.fcmTokens?.length && userToNotify?.enableNotification) {
        const campaign = await ScratchCardCampaign.findById(result.campaignId);
        let rewardText = "";
        if (result.rewardType === "POINTS") {
          rewardText = `${result.pointsAmount} Bonus Points`;
        } else if (result.rewardType === "GIFT") {
          const gift = await Gift.findById(result.giftId);
          rewardText = gift ? gift.name : "a Special Gift";
        }

        await sendFcmNotifications(
          userToNotify.fcmTokens,
          APP_NOTIFICATIONS.scratchCards.rewardWon.title,
          formatNotification(APP_NOTIFICATIONS.scratchCards.rewardWon.body, { 
            rewardText, 
            campaignName: campaign ? campaign.name : "Scratch Card" 
          })
        );
      }
    }

    return { success: true, message: "Scratch card revealed", data: result };
  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    await session.endSession();
  }
};

// Internal Integration

exports.generateScratchCardForScan = async (userId, productId, redeemId, session = null) => {
  try {
    const now = new Date();
    // Find active campaigns that include this product
    const campaign = await ScratchCardCampaign.findOne({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      eligibleProducts: productId
    }).session(session);

    if (!campaign) return null; // No active campaign for this product

    // Determine Reward based on probability
    let selectedReward = null;
    let pool = campaign.rewardPool;
    if (pool && pool.length > 0) {
      // Filter out rewards that are out of stock (if totalQuantity > 0)
      const availablePool = pool.filter(r => r.totalQuantity === 0 || r.remainingQuantity > 0);
      
      const totalProb = availablePool.reduce((sum, r) => sum + r.probability, 0);
      let randomNum = Math.random() * totalProb;
      
      for (const reward of availablePool) {
        if (randomNum < reward.probability) {
          selectedReward = reward;
          break;
        }
        randomNum -= reward.probability;
      }
    }

    // Default to NONE if something fails
    const cardData = {
      userId,
      campaignId: campaign._id,
      redeemId,
      status: "UNREVEALED",
      rewardType: "NONE",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days expiry
    };

    if (selectedReward) {
      cardData.rewardType = selectedReward.type;
      if (selectedReward.type === "POINTS") {
        cardData.pointsAmount = selectedReward.points;
      } else if (selectedReward.type === "GIFT") {
        cardData.giftId = selectedReward.giftId;
      }
      
      // Decrement remaining quantity if limited
      if (selectedReward.totalQuantity > 0) {
        await ScratchCardCampaign.updateOne(
          { _id: campaign._id, "rewardPool._id": selectedReward._id },
          { $inc: { "rewardPool.$.remainingQuantity": -1 } },
          { session }
        );
      }
    }

    const scratchCard = new ScratchCard(cardData);
    await scratchCard.save({ session });
    return scratchCard;

  } catch (error) {
    console.error("Error generating scratch card:", error);
    return null;
  }
};

const GiftCategory = require("../../schemas/gift-category.schema");
const Gift = require("../../schemas/gift.schema");
const mongoose = require("mongoose");
const GiftRedemption = require("../../schemas/gift-redemption.schema");
const User = require("../../schemas/user.schema");
const { GIFT_REDEMPTION_STATUS } = require("../../constants/gift");
const { getPaginationParams } = require("../../utils/heplers");

// --- Categories ---

exports.categoryList = async (data) => {
  try {
    const { search = "", sortBy = "createdAt", sortOrder = "desc" } = data;
    const { page: pageNum, limit: limitNum, skip } = getPaginationParams(data);
    let matchQuery = {};

    if (search) {
      matchQuery.name = { $regex: search, $options: "i" };
    }

    if (data?.active !== undefined) {
      matchQuery.active = data.active;
    }

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const records = await GiftCategory.find(matchQuery)
      .skip(skip)
      .limit(limitNum)
      .sort(sort);

    const total = await GiftCategory.countDocuments(matchQuery);

    return {
      success: true,
      data: {
        records,
        total,
        totalPages: Math.ceil(total / limitNum),
        page: pageNum,
        limit: limitNum,
      },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.createCategory = async (categoryData) => {
  try {
    const existing = await GiftCategory.findOne({ name: categoryData.name });
    if (existing) {
      return { success: false, message: "Category with this name already exists" };
    }
    const category = new GiftCategory(categoryData);
    await category.save();
    return { success: true, message: "Category created successfully", data: category };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.updateCategory = async (categoryData, categoryId) => {
  try {
    if (categoryData.name) {
      const existing = await GiftCategory.findOne({
        name: categoryData.name,
        _id: { $ne: categoryId },
      });
      if (existing) {
        return { success: false, message: "Category with this name already exists" };
      }
    }
    const category = await GiftCategory.findByIdAndUpdate(categoryId, categoryData, { new: true });
    if (!category) return { success: false, message: "Category not found" };
    return { success: true, message: "Category updated successfully", data: category };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.deleteCategory = async (categoryId) => {
  try {
    const giftsWithCategory = await Gift.findOne({ categoryId });
    if (giftsWithCategory) {
      return { success: false, message: "Cannot delete category as gifts are associated with it" };
    }
    const category = await GiftCategory.findByIdAndDelete(categoryId);
    if (!category) return { success: false, message: "Category not found" };
    return { success: true, message: "Category deleted successfully" };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// --- Gifts ---

exports.giftList = async (data, isAdmin) => {
  try {
    const { search = "", sortBy = "createdAt", sortOrder = "desc" } = data;
    const { page: pageNum, limit: limitNum, skip } = getPaginationParams(data);
    let matchQuery = {};

    if (search) {
      matchQuery.name = { $regex: search, $options: "i" };
    }

    if (data?.categoryId) {
      matchQuery.categoryId = data.categoryId;
    }

    if (!isAdmin) {
      matchQuery.active = true;
    } else if (data?.active !== undefined) {
      matchQuery.active = data.active;
    }

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const records = await Gift.find(matchQuery)
      .populate("categoryId", "name active")
      .populate("rewardRules.minTierId", "name")
      .skip(skip)
      .limit(limitNum)
      .sort(sort);

    const total = await Gift.countDocuments(matchQuery);

    return {
      success: true,
      data: {
        records,
        total,
        totalPages: Math.ceil(total / limitNum),
        page: pageNum,
        limit: limitNum,
      },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.getGiftDetails = async (giftId) => {
  try {
    const gift = await Gift.findById(giftId)
      .populate("categoryId", "name")
      .populate("rewardRules.minTierId", "name");

    if (!gift) return { success: false, message: "Gift not found" };
    return { success: true, data: gift };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.createGift = async (giftData) => {
  try {
    const gift = new Gift(giftData);
    await gift.save();
    return { success: true, message: "Gift created successfully", data: gift };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.updateGift = async (giftData, giftId) => {
  try {
    const gift = await Gift.findByIdAndUpdate(giftId, giftData, { new: true });
    if (!gift) return { success: false, message: "Gift not found" };
    return { success: true, message: "Gift updated successfully", data: gift };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.deleteGift = async (giftId) => {
  try {
    const gift = await Gift.findByIdAndDelete(giftId);
    if (!gift) return { success: false, message: "Gift not found" };
    return { success: true, message: "Gift deleted successfully" };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// --- Redemptions ---

const checkEligibility = async (user, gift, session = null) => {
  const rules = {
    coins: { required: gift.priceInCoins, current: user.hydaconCoins || 0, satisfied: (user.hydaconCoins || 0) >= gift.priceInCoins },
    tier: { required: "None", current: "None", satisfied: true },
    scans: { required: 0, current: 0, satisfied: true },
    region: { required: [], current: user.areaOfOperation || "None", satisfied: true }
  };

  const reasons = [];

  // Coins requirement
  if (!rules.coins.satisfied) {
    reasons.push(`Requires at least ${gift.priceInCoins.toLocaleString()} coins (Current: ${(user.hydaconCoins || 0).toLocaleString()})`);
  }

  // Tier requirement
  if (gift.rewardRules && gift.rewardRules.minTierId) {
    const Tier = mongoose.model("Tier");
    const requiredTier = await Tier.findById(gift.rewardRules.minTierId).session(session);
    if (requiredTier) {
      rules.tier.required = requiredTier.name;
      let userTier = null;
      if (user.currentTierId) {
        userTier = await Tier.findById(user.currentTierId).session(session);
      }
      rules.tier.current = userTier ? userTier.name : "Beginner";
      const userRank = userTier ? userTier.rank : 0;
      rules.tier.satisfied = userRank >= requiredTier.rank;
      if (!rules.tier.satisfied) {
        reasons.push(`Requires ${requiredTier.name} membership tier or above (Current: ${rules.tier.current})`);
      }
    }
  }

  // Scan requirement
  if (gift.rewardRules && gift.rewardRules.minScansThisMonth > 0) {
    const requiredScans = gift.rewardRules.minScansThisMonth;
    rules.scans.required = requiredScans;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const Redeem = mongoose.model("Redeem");
    const scansCount = await Redeem.countDocuments({
      userId: user._id,
      createdAt: { $gte: startOfMonth }
    }).session(session);

    rules.scans.current = scansCount;
    rules.scans.satisfied = scansCount >= requiredScans;
    if (!rules.scans.satisfied) {
      reasons.push(`Requires at least ${requiredScans} bag scans this month (Current: ${scansCount})`);
    }
  }

  // Region restriction
  if (gift.rewardRules && gift.rewardRules.regionRestrictions && gift.rewardRules.regionRestrictions.length > 0) {
    const allowedRegions = gift.rewardRules.regionRestrictions;
    rules.region.required = allowedRegions;
    
    const userRegion = user.areaOfOperation || "";
    rules.region.satisfied = allowedRegions.some(
      r => r.trim().toLowerCase() === userRegion.trim().toLowerCase()
    );
    if (!rules.region.satisfied) {
      reasons.push(`Gift is not available in your region (${userRegion || "No region set"})`);
    }
  }

  const eligible = rules.coins.satisfied && rules.tier.satisfied && rules.scans.satisfied && rules.region.satisfied;

  return { eligible, reasons, rules };
};

exports.getGiftEligibility = async (userId, giftId) => {
  try {
    const user = await User.findById(userId);
    const gift = await Gift.findById(giftId);
    if (!user) return { success: false, message: "User not found" };
    if (!gift) return { success: false, message: "Gift not found" };

    const eligibility = await checkEligibility(user, gift);
    return { success: true, data: eligibility };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.getUserRedemptionDetails = async (userId, redemptionId) => {
  try {
    const redemption = await GiftRedemption.findById(redemptionId)
      .populate("giftId", "name image priceInCoins description");
    if (!redemption) return { success: false, message: "Redemption not found" };
    if (String(redemption.userId) !== String(userId)) {
      return { success: false, message: "Unauthorized access" };
    }
    return { success: true, data: redemption };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.redeemGift = async (userId, data) => {
  const { giftId, shippingAddress } = data;
  if (!giftId || !shippingAddress) return { success: false, message: "Gift ID and shipping address are required" };

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const user = await User.findById(userId).session(session);
      const gift = await Gift.findById(giftId).session(session);

      if (!user) throw new Error("User not found");
      if (!gift || !gift.active) throw new Error("Gift not available");

      const eligibility = await checkEligibility(user, gift, session);
      if (!eligibility.eligible) {
        throw new Error(eligibility.reasons.join(", "));
      }

      const availableStock = gift.stockQuantity - gift.reservedQuantity;
      if (availableStock <= 0) throw new Error("Gift is out of stock");

      user.hydaconCoins -= gift.priceInCoins;
      gift.reservedQuantity += 1;

      await user.save({ session });
      await gift.save({ session });

      const redemption = new GiftRedemption({
        userId,
        giftId,
        coinsUsed: gift.priceInCoins,
        shippingAddress,
      });

      await redemption.save({ session });
      result = redemption;
    });

    return { success: true, message: "Gift redeemed successfully", data: result };
  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    await session.endSession();
  }
};

exports.userRedemptions = async (userId, data) => {
  try {
    const { page: pageNum, limit: limitNum, skip } = getPaginationParams(data);

    const records = await GiftRedemption.find({ userId })
      .populate({ path: "giftId", select: "name image categoryId", populate: { path: "categoryId", select: "name active" } })
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    const total = await GiftRedemption.countDocuments({ userId });

    return {
      success: true,
      data: { records, total, totalPages: Math.ceil(total / limitNum), page: pageNum, limit: limitNum },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.adminRedemptionList = async (data) => {
  try {
    const { page: pageNum, limit: limitNum, skip } = getPaginationParams(data);
    let matchQuery = {};
    if (data?.status) matchQuery.status = data.status;

    const records = await GiftRedemption.find(matchQuery)
      .populate("userId", "name email phone")
      .populate("giftId", "name image priceInCoins")
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    const total = await GiftRedemption.countDocuments(matchQuery);

    return {
      success: true,
      data: { records, total, totalPages: Math.ceil(total / limitNum), page: pageNum, limit: limitNum },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.adminRedemptionDetails = async (redemptionId) => {
  try {
    const redemption = await GiftRedemption.findById(redemptionId)
      .populate("userId", "name email phone hydaconCoins")
      .populate("giftId", "name image priceInCoins description stockQuantity reservedQuantity");

    if (!redemption) return { success: false, message: "Redemption not found" };
    
    return { success: true, data: redemption };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.adminUpdateRedemption = async (redemptionId, data) => {
  const { status, trackingNumber, courierDetails, cancellationReason } = data;

  if (status && !Object.values(GIFT_REDEMPTION_STATUS).includes(status)) {
    return { success: false, message: "Invalid redemption status" };
  }

  const session = await mongoose.startSession();

  try {
    let result;
    await session.withTransaction(async () => {
      const redemption = await GiftRedemption.findById(redemptionId).session(session);
      if (!redemption) throw new Error("Redemption not found");

      if (status && status !== redemption.status) {
        if (redemption.status === GIFT_REDEMPTION_STATUS.CANCELLED || redemption.status === GIFT_REDEMPTION_STATUS.DELIVERED) {
          throw new Error(`Cannot change status from ${redemption.status} to ${status}`);
        }
      }

      // Handle cancellation logic (refund coins, reduce reserved/stock)
      if (status === GIFT_REDEMPTION_STATUS.CANCELLED && redemption.status !== GIFT_REDEMPTION_STATUS.CANCELLED) {
        const user = await User.findById(redemption.userId).session(session);
        const gift = await Gift.findById(redemption.giftId).session(session);

        if (user) {
          user.hydaconCoins += redemption.coinsUsed;
          await user.save({ session });
        }

        if (gift) {
          gift.reservedQuantity = Math.max(0, gift.reservedQuantity - 1);
          await gift.save({ session });
        }
      }
      // Handle delivered logic (reduce actual stock, reduce reserved)
      else if (status === GIFT_REDEMPTION_STATUS.DELIVERED && redemption.status !== GIFT_REDEMPTION_STATUS.DELIVERED) {
        const gift = await Gift.findById(redemption.giftId).session(session);
        if (gift) {
          gift.reservedQuantity = Math.max(0, gift.reservedQuantity - 1);
          gift.stockQuantity = Math.max(0, gift.stockQuantity - 1);
          await gift.save({ session });
        }
      }

      if (status) redemption.status = status;
      if (trackingNumber !== undefined) redemption.trackingNumber = trackingNumber;
      if (courierDetails !== undefined) redemption.courierDetails = courierDetails;
      if (cancellationReason !== undefined) redemption.cancellationReason = cancellationReason;

      await redemption.save({ session });
      result = redemption;
    });

    return { success: true, message: "Redemption updated successfully", data: result };
  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    await session.endSession();
  }
};

exports.getAnalytics = async () => {
  try {
    // 1. Most redeemed gifts
    const mostRedeemedGifts = await GiftRedemption.aggregate([
      { $match: { status: { $ne: GIFT_REDEMPTION_STATUS.CANCELLED } } },
      { $group: { _id: "$giftId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: "gifts", localField: "_id", foreignField: "_id", as: "gift" } },
      { $unwind: "$gift" },
      { $project: { _id: 1, count: 1, name: "$gift.name", image: "$gift.image" } }
    ]);

    // 2. Coin consumption reports (by month)
    const coinConsumption = await GiftRedemption.aggregate([
      { $match: { status: { $ne: GIFT_REDEMPTION_STATUS.CANCELLED } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          totalCoins: { $sum: "$coinsUsed" },
          totalRedemptions: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 }
    ]);

    // 3. Inventory movement reports (current stock vs reserved stock)
    const inventoryMovement = await Gift.aggregate([
      {
        $group: {
          _id: null,
          totalStock: { $sum: "$stockQuantity" },
          totalReserved: { $sum: "$reservedQuantity" },
          totalGifts: { $sum: 1 }
        }
      }
    ]);

    return {
      success: true,
      data: {
        mostRedeemedGifts,
        coinConsumption,
        inventoryMovement: inventoryMovement[0] || { totalStock: 0, totalReserved: 0, totalGifts: 0 }
      }
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

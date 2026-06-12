const GiftCategory = require("../../schemas/gift-category.schema");
const Gift = require("../../schemas/gift.schema");
const mongoose = require("mongoose");

// --- Categories ---

exports.categoryList = async (data) => {
  try {
    const { page = 1, limit = 10, search = "", sortBy = "createdAt", sortOrder = "desc" } = data;
    const skip = (page - 1) * limit;
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
      .limit(limit)
      .sort(sort);

    const total = await GiftCategory.countDocuments(matchQuery);

    return {
      success: true,
      data: {
        records,
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
    const { page = 1, limit = 10, search = "", sortBy = "createdAt", sortOrder = "desc" } = data;
    const skip = (page - 1) * limit;
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
      .limit(limit)
      .sort(sort);

    const total = await Gift.countDocuments(matchQuery);

    return {
      success: true,
      data: {
        records,
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

const GiftRedemption = require("../../schemas/gift-redemption.schema");
const User = require("../../schemas/user.schema");

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
      if (user.hydaconCoins < gift.priceInCoins) throw new Error("Insufficient Hydacon Coins");

      const availableStock = gift.stockQuantity - gift.reservedQuantity;
      if (availableStock <= 0) throw new Error("Gift is out of stock");

      if (gift.rewardRules) {
        if (gift.rewardRules.minTierId && String(gift.rewardRules.minTierId) !== String(user.currentTierId)) {
           // Should ideally check hierarchy if tier is higher, but direct match for now
        }
        // Min scans check could go here based on user.totalScans in the month.
      }

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
    const { page = 1, limit = 10 } = data;
    const skip = (page - 1) * limit;

    const records = await GiftRedemption.find({ userId })
      .populate("giftId", "name image")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await GiftRedemption.countDocuments({ userId });

    return {
      success: true,
      data: { records, total, totalPages: Math.ceil(total / limit), page, limit },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.adminRedemptionList = async (data) => {
  try {
    const { page = 1, limit = 10 } = data;
    const skip = (page - 1) * limit;
    let matchQuery = {};
    if (data?.status) matchQuery.status = data.status;

    const records = await GiftRedemption.find(matchQuery)
      .populate("userId", "name email phone")
      .populate("giftId", "name image priceInCoins")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await GiftRedemption.countDocuments(matchQuery);

    return {
      success: true,
      data: { records, total, totalPages: Math.ceil(total / limit), page, limit },
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
  const session = await mongoose.startSession();

  try {
    let result;
    await session.withTransaction(async () => {
      const redemption = await GiftRedemption.findById(redemptionId).session(session);
      if (!redemption) throw new Error("Redemption not found");

      // Handle cancellation logic (refund coins, reduce reserved/stock)
      if (status === "Cancelled" && redemption.status !== "Cancelled") {
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
      else if (status === "Delivered" && redemption.status !== "Delivered") {
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
      { $match: { status: { $ne: "Cancelled" } } },
      { $group: { _id: "$giftId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: "gifts", localField: "_id", foreignField: "_id", as: "gift" } },
      { $unwind: "$gift" },
      { $project: { _id: 1, count: 1, name: "$gift.name", image: "$gift.image" } }
    ]);

    // 2. Coin consumption reports (by month)
    const coinConsumption = await GiftRedemption.aggregate([
      { $match: { status: { $ne: "Cancelled" } } },
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

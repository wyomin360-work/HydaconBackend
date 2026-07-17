const GiftCategory = require("../../schemas/gift-category.schema");
const Gift = require("../../schemas/gift.schema");
const mongoose = require("mongoose");
const GiftRedemption = require("../../schemas/gift-redemption.schema");
const Document = require("../../schemas/document.schema");
const User = require("../../schemas/user.schema");
const { GIFT_REDEMPTION_STATUS } = require("../../constants/gift");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const { getPaginationParams, attachId } = require("../../utils/heplers");
const { RuleSet } = require("../../schemas/rule-set.schema");
const ruleSetEvaluator = require("../rule-set/rule-set.evaluator");
const { sendTemplateEmail } = require("../../functions/nodemailer");
const { sendFcmNotifications } = require("../../functions/fcm");
const ScratchCardRule = require("../../schemas/scratch-card-rule.schema");

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
      return {
        success: false,
        message: "Category with this name already exists",
      };
    }
    const category = new GiftCategory(categoryData);
    await category.save();
    return {
      success: true,
      message: "Category created successfully",
      data: category,
    };
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
        return {
          success: false,
          message: "Category with this name already exists",
        };
      }
    }
    const category = await GiftCategory.findByIdAndUpdate(
      categoryId,
      categoryData,
      { new: true },
    );
    if (!category) return { success: false, message: "Category not found" };
    return {
      success: true,
      message: "Category updated successfully",
      data: category,
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.deleteCategory = async (categoryId) => {
  try {
    const giftsWithCategory = await Gift.findOne({ categoryId });
    if (giftsWithCategory) {
      return {
        success: false,
        message: "Cannot delete category as gifts are associated with it",
      };
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
      .populate("ruleSetId", "name")
      .skip(skip)
      .limit(limitNum)
      .sort(sort)
      .lean();

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
      .populate("ruleSetId", "name active validFrom validUntil");

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
    coins: {
      required: gift.priceInCoins,
      current: user.hydaconCoins || 0,
      satisfied: (user.hydaconCoins || 0) >= gift.priceInCoins,
    },
  };

  const reasons = [];

  // Coins requirement
  if (!rules.coins.satisfied) {
    reasons.push(
      `Requires at least ${gift.priceInCoins.toLocaleString()} coins (Current: ${(user.hydaconCoins || 0).toLocaleString()})`,
    );
  }

  let eligible = rules.coins.satisfied;
  let dynamicRules = [];

  // RuleSet Evaluation
  if (gift.ruleSetId) {
    const ruleSet = await RuleSet.findById(gift.ruleSetId).session(session);
    if (ruleSet) {
      const evaluation = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        user,
        { targetId: gift._id },
        session,
      );
      dynamicRules = evaluation.evaluatedRules;
      if (!evaluation.eligible) {
        eligible = false;
        reasons.push(...evaluation.reasons);
      }
    }
  }

  return { eligible, reasons, rules: { ...rules, dynamic: dynamicRules } };
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
      .populate({
        path: "giftId",
        select: "name image priceInCoins description categoryId",
        populate: { path: "categoryId", select: "name" },
      })
      .lean();
    if (!redemption) return { success: false, message: "Redemption not found" };
    if (String(redemption.userId) !== String(userId)) {
      return { success: false, message: "Unauthorized access" };
    }

    if (redemption.voucherFileUrl) {
      const doc = await Document.findById(redemption.voucherFileUrl).lean();
      if (doc && doc.docUrl) {
        redemption.voucherFileUrl = doc.docUrl;
      }
    }

    return { success: true, data: redemption };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

/**
 * Sends voucher email + push notification after a successful voucher redemption.
 * Runs outside the transaction (fire-and-forget, non-blocking).
 */
const sendVoucherNotifications = async (user, gift, redemption) => {
  try {
    const isCode = gift.voucherRedemptionType === "code";
    const isFile = gift.voucherRedemptionType === "file";

    let resolvedVoucherFileUrl = redemption.voucherFileUrl || "";
    if (isFile && resolvedVoucherFileUrl) {
      const doc = await Document.findById(resolvedVoucherFileUrl).lean();
      if (doc && doc.docUrl) {
        resolvedVoucherFileUrl = doc.docUrl;
      }
    }

    // 1. Send celebratory email
    if (user.email) {
      await sendTemplateEmail(
        user.email,
        "users/voucher-redeemed",
        `🎉 Your ${gift.name} Voucher is Here!`,
        {
          userName: user.name || "there",
          giftName: gift.name,
          coinsUsed: redemption.coinsUsed,
          voucherCode: redemption.voucherCode || "",
          voucherFileUrl: resolvedVoucherFileUrl,
          isCode,
          isFile,
          year: new Date().getFullYear(),
        },
      );
    }

    // 2. Send FCM push notification
    const fcmTokens = (user.fcmTokens || []).filter(Boolean);
    if (fcmTokens.length > 0) {
      const notif = isFile
        ? APP_NOTIFICATIONS.gifts.voucherFile
        : APP_NOTIFICATIONS.gifts.voucherRedeemed;
      const notifBody = notif.body.replace("{{giftName}}", gift.name);
      await sendFcmNotifications(fcmTokens, notif.title, notifBody, {
        type: "voucher_redeemed",
        redemptionId: String(redemption._id),
        giftId: String(gift._id),
      });
    }

    // 3. Mark voucherSent on the redemption record
    await GiftRedemption.findByIdAndUpdate(redemption._id, {
      voucherSent: true,
    });
  } catch (err) {
    console.error("[Gift] sendVoucherNotifications error:", err.message);
  }
};

exports.redeemGift = async (userId, data) => {
  const { giftId, shippingAddress } = data;
  if (!giftId)
    return {
      success: false,
      message: "Gift ID is required",
    };

  const session = await mongoose.startSession();
  try {
    let result;
    let userForNotification;
    let giftForNotification;

    await session.withTransaction(async () => {
      const user = await User.findById(userId).session(session);
      const gift = await Gift.findById(giftId).session(session);

      if (!user) throw new Error("User not found");
      if (!gift || !gift.active) throw new Error("Gift not available");
      if (gift.giftType === "physical" && !shippingAddress) {
        throw new Error("Shipping address is required for physical gifts");
      }

      // Validate voucher gift has required redemption data
      if (gift.giftType === "voucher") {
        if (!gift.voucherRedemptionType) {
          throw new Error(
            "This voucher gift is not properly configured. Please contact support.",
          );
        }
        if (gift.voucherRedemptionType === "code" && !gift.voucherCode) {
          throw new Error(
            "This voucher code is not yet available. Please try again later.",
          );
        }
        if (gift.voucherRedemptionType === "file" && !gift.voucherFileUrl) {
          throw new Error(
            "This voucher file is not yet available. Please try again later.",
          );
        }
      }

      const eligibility = await checkEligibility(user, gift, session);
      if (!eligibility.eligible) {
        throw new Error(eligibility.reasons.join(", "));
      }

      const availableStock = gift.stockQuantity - gift.reservedQuantity;
      if (availableStock <= 0) throw new Error("Gift is out of stock");

      // Atomically deduct coins ensuring balance doesn't dip below required amount concurrently
      const updatedUser = await User.findOneAndUpdate(
        { _id: userId, hydaconCoins: { $gte: gift.priceInCoins } },
        { $inc: { hydaconCoins: -gift.priceInCoins } },
        { session, new: true },
      );

      if (!updatedUser) {
        throw new Error("Insufficient coins for redemption");
      }

      // Atomically reserve stock ensuring it hasn't been taken by another concurrent request
      const updatedGift = await Gift.findOneAndUpdate(
        {
          _id: giftId,
          $expr: { $gt: ["$stockQuantity", "$reservedQuantity"] },
        },
        { $inc: { reservedQuantity: 1 } },
        { session, new: true },
      );

      if (!updatedGift) {
        throw new Error("Gift is out of stock");
      }

      // Build redemption payload
      const isVoucher = gift.giftType === "voucher";
      const redemptionData = {
        userId,
        giftId,
        coinsUsed: gift.priceInCoins,
        giftType: gift.giftType,
        ...(gift.giftType === "physical" && { shippingAddress }),
        // For vouchers: auto-deliver and snapshot voucher details
        ...(isVoucher && {
          status: GIFT_REDEMPTION_STATUS.DELIVERED,
          voucherCode: gift.voucherCode || undefined,
          voucherFileUrl: gift.voucherFileUrl || undefined,
        }),
      };

      // For vouchers: also reduce actual stock immediately (digital delivery)
      if (isVoucher) {
        await Gift.findOneAndUpdate(
          { _id: giftId },
          { $inc: { stockQuantity: -1, reservedQuantity: -1 } },
          { session },
        );
      }

      const redemption = new GiftRedemption(redemptionData);
      await redemption.save({ session });
      result = redemption;
      userForNotification = user;
      giftForNotification = gift;
    });

    // After transaction: fire email + push for vouchers (non-blocking)
    if (giftForNotification?.giftType === "voucher" && userForNotification) {
      setImmediate(() =>
        sendVoucherNotifications(
          userForNotification,
          giftForNotification,
          result,
        ),
      );
    }

    return {
      success: true,
      message: "Gift redeemed successfully",
      data: result,
    };
  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    await session.endSession();
  }
};

exports.userRedemptions = async (userId, data) => {
  try {
    const { search = "" } = data;
    const { page: pageNum, limit: limitNum, skip } = getPaginationParams(data);

    let matchQuery = { userId };

    if (search) {
      const matchingGifts = await Gift.find({
        name: { $regex: search, $options: "i" },
      })
        .select("_id")
        .lean();
      const giftIds = matchingGifts.map((g) => g._id);
      matchQuery.giftId = { $in: giftIds };
    }

    const records = await GiftRedemption.find(matchQuery)
      .populate({
        path: "giftId",
        select: "name image categoryId",
        populate: { path: "categoryId", select: "name active" },
      })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await GiftRedemption.countDocuments(matchQuery);

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

exports.adminRedemptionDetails = async (redemptionId) => {
  try {
    const redemption = await GiftRedemption.findById(redemptionId)
      .populate("userId", "name email phone hydaconCoins")
      .populate(
        "giftId",
        "name image priceInCoins description stockQuantity reservedQuantity",
      )
      .lean();

    if (!redemption) return { success: false, message: "Redemption not found" };

    if (redemption.voucherFileUrl) {
      const doc = await Document.findById(redemption.voucherFileUrl).lean();
      if (doc && doc.docUrl) {
        redemption.voucherFileUrl = doc.docUrl;
      }
    }

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
      const redemption =
        await GiftRedemption.findById(redemptionId).session(session);
      if (!redemption) throw new Error("Redemption not found");

      if (status && status !== redemption.status) {
        if (
          redemption.status === GIFT_REDEMPTION_STATUS.CANCELLED ||
          redemption.status === GIFT_REDEMPTION_STATUS.DELIVERED
        ) {
          throw new Error(
            `Cannot change status from ${redemption.status} to ${status}`,
          );
        }
      }

      // Handle cancellation logic (refund coins, reduce reserved/stock)
      if (
        status === GIFT_REDEMPTION_STATUS.CANCELLED &&
        redemption.status !== GIFT_REDEMPTION_STATUS.CANCELLED
      ) {
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
      else if (
        status === GIFT_REDEMPTION_STATUS.DELIVERED &&
        redemption.status !== GIFT_REDEMPTION_STATUS.DELIVERED
      ) {
        const gift = await Gift.findById(redemption.giftId).session(session);
        if (gift) {
          gift.reservedQuantity = Math.max(0, gift.reservedQuantity - 1);
          gift.stockQuantity = Math.max(0, gift.stockQuantity - 1);
          await gift.save({ session });
        }
      }

      if (status) redemption.status = status;
      if (trackingNumber !== undefined)
        redemption.trackingNumber = trackingNumber;
      if (courierDetails !== undefined)
        redemption.courierDetails = courierDetails;
      if (cancellationReason !== undefined)
        redemption.cancellationReason = cancellationReason;

      await redemption.save({ session });
      result = redemption;
    });

    return {
      success: true,
      message: "Redemption updated successfully",
      data: result,
    };
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
      {
        $lookup: {
          from: "gifts",
          localField: "_id",
          foreignField: "_id",
          as: "gift",
        },
      },
      { $unwind: "$gift" },
      {
        $project: {
          _id: 1,
          count: 1,
          name: "$gift.name",
          image: "$gift.image",
        },
      },
    ]);

    // 2. Coin consumption reports (by month)
    const coinConsumption = await GiftRedemption.aggregate([
      { $match: { status: { $ne: GIFT_REDEMPTION_STATUS.CANCELLED } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          totalCoins: { $sum: "$coinsUsed" },
          totalRedemptions: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 },
    ]);

    // 3. Inventory movement reports (current stock vs reserved stock)
    const inventoryMovement = await Gift.aggregate([
      {
        $group: {
          _id: null,
          totalStock: { $sum: "$stockQuantity" },
          totalReserved: { $sum: "$reservedQuantity" },
          totalGifts: { $sum: 1 },
        },
      },
    ]);

    return {
      success: true,
      data: {
        mostRedeemedGifts,
        coinConsumption,
        inventoryMovement: inventoryMovement[0] || {
          totalStock: 0,
          totalReserved: 0,
          totalGifts: 0,
        },
      },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// --- Scratch Card Configuration ---

exports.getScratchCardConfig = async () => {
  try {
    const configDoc = await AppConfig.findOne().lean();
    if (!configDoc) return { success: false, message: "App config not found" };

    const settings = configDoc.scratchCardSettings || {};

    // Populate selectedGiftIds with full gift data if any are set
    let giftPool = [];
    if (settings.selectedGiftIds && settings.selectedGiftIds.length > 0) {
      giftPool = await Gift.find({ _id: { $in: settings.selectedGiftIds } })
        .select(
          "_id name image priceInCoins active stockQuantity reservedQuantity",
        )
        .lean();
    }

    // Count all available gifts for context
    const totalActiveGifts = await Gift.countDocuments({
      active: true,
      stockQuantity: { $gt: 0 },
    });

    return {
      success: true,
      data: {
        ...settings,
        giftPool,
        totalActiveGifts,
        useAllGifts:
          !settings.selectedGiftIds || settings.selectedGiftIds.length === 0,
      },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.updateScratchCardConfig = async (configData) => {
  try {
    const {
      enabled,
      probability,
      minBonusPoints,
      maxBonusPoints,
      giftProbability,
      selectedGiftIds,
    } = configData;

    // Validate probability values
    if (probability !== undefined && (probability < 0 || probability > 100)) {
      return {
        success: false,
        message: "Probability must be between 0 and 100",
      };
    }
    if (
      giftProbability !== undefined &&
      (giftProbability < 0 || giftProbability > 100)
    ) {
      return {
        success: false,
        message: "Gift probability must be between 0 and 100",
      };
    }
    if (
      minBonusPoints !== undefined &&
      maxBonusPoints !== undefined &&
      minBonusPoints > maxBonusPoints
    ) {
      return {
        success: false,
        message: "Min bonus points cannot exceed max bonus points",
      };
    }

    // If selectedGiftIds provided, verify each gift exists
    if (selectedGiftIds && selectedGiftIds.length > 0) {
      const count = await Gift.countDocuments({
        _id: { $in: selectedGiftIds },
      });
      if (count !== selectedGiftIds.length) {
        return {
          success: false,
          message: "One or more selected gift IDs are invalid",
        };
      }
    }

    const update = {};
    if (enabled !== undefined) update["scratchCardSettings.enabled"] = enabled;
    if (probability !== undefined)
      update["scratchCardSettings.probability"] = probability;
    if (minBonusPoints !== undefined)
      update["scratchCardSettings.minBonusPoints"] = minBonusPoints;
    if (maxBonusPoints !== undefined)
      update["scratchCardSettings.maxBonusPoints"] = maxBonusPoints;
    if (giftProbability !== undefined)
      update["scratchCardSettings.giftProbability"] = giftProbability;
    if (selectedGiftIds !== undefined)
      update["scratchCardSettings.selectedGiftIds"] = selectedGiftIds;

    const updatedConfig = await AppConfig.findOneAndUpdate(
      {},
      { $set: update },
      { new: true, upsert: false },
    );

    if (!updatedConfig)
      return { success: false, message: "App config not found" };

    return {
      success: true,
      message: "Scratch card configuration updated successfully",
      data: updatedConfig.scratchCardSettings,
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// --- Scratch Card Rules CRUD ---

exports.listScratchCardRules = async () => {
  try {
    const rules = await ScratchCardRule.find()
      .populate("tierId")
      .populate("giftId")
      .populate("ruleSetId")
      .populate("gifts.giftId")
      .populate({
        path: "rewards.giftId",
        populate: {
          path: "categoryId",
        },
      })
      .sort({ createdAt: -1 })
      .lean();
    return { success: true, data: rules };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.createScratchCardRule = async (data) => {
  try {
    const {
      tierId,
      rewardType,
      minCoins,
      maxCoins,
      giftId,
      active,
      ruleSetId,
      gifts,
      name,
      description,
      startDate,
      endDate,
      totalScratchLimit,
      perUserScratchLimit,
      rewards,
    } = data;

    const newRule = await ScratchCardRule.create({
      tierId: tierId || null,
      rewardType: rewardType || "GIFT",
      minCoins: rewardType === "POINTS" ? Number(minCoins) : 0,
      maxCoins: rewardType === "POINTS" ? Number(maxCoins) : 0,
      giftId: rewardType === "GIFT" ? giftId || null : null,
      ruleSetId,
      gifts: gifts || [],
      active: active !== undefined ? active : true,
      name: name || "",
      description: description || "",
      startDate: startDate || null,
      endDate: endDate || null,
      totalScratchLimit:
        totalScratchLimit !== undefined ? Number(totalScratchLimit) : 0,
      perUserScratchLimit:
        perUserScratchLimit !== undefined ? Number(perUserScratchLimit) : 0,
      rewards: rewards || [],
    });

    // Populate rule references for clean response
    const populated = await ScratchCardRule.findById(newRule._id)
      .populate("tierId")
      .populate("giftId")
      .populate("gifts.giftId")
      .populate({
        path: "rewards.giftId",
        populate: {
          path: "categoryId",
        },
      })
      .lean();

    return {
      success: true,
      message: "Scratch card rule created successfully",
      data: populated,
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.updateScratchCardRule = async (id, data) => {
  try {
    const {
      tierId,
      rewardType,
      minCoins,
      maxCoins,
      giftId,
      active,
      ruleSetId,
      gifts,
      name,
      description,
      startDate,
      endDate,
      totalScratchLimit,
      perUserScratchLimit,
      rewards,
    } = data;
    const rule = await ScratchCardRule.findById(id);
    if (!rule)
      return { success: false, message: "Scratch card rule not found" };

    const finalRewardType =
      rewardType !== undefined ? rewardType : rule.rewardType;

    if (tierId !== undefined) rule.tierId = tierId || null;
    if (rewardType !== undefined) rule.rewardType = rewardType;
    rule.minCoins =
      finalRewardType === "POINTS"
        ? minCoins !== undefined
          ? Number(minCoins)
          : rule.minCoins
        : 0;
    rule.maxCoins =
      finalRewardType === "POINTS"
        ? maxCoins !== undefined
          ? Number(maxCoins)
          : rule.maxCoins
        : 0;
    rule.giftId =
      finalRewardType === "GIFT"
        ? giftId !== undefined
          ? giftId
          : rule.giftId
        : null;
    if (active !== undefined) rule.active = active;
    if (gifts !== undefined) rule.gifts = gifts;

    // Campaign fields
    if (name !== undefined) rule.name = name;
    if (description !== undefined) rule.description = description;
    if (startDate !== undefined) rule.startDate = startDate || null;
    if (endDate !== undefined) rule.endDate = endDate || null;
    if (totalScratchLimit !== undefined)
      rule.totalScratchLimit = Number(totalScratchLimit);
    if (perUserScratchLimit !== undefined)
      rule.perUserScratchLimit = Number(perUserScratchLimit);
    if (rewards !== undefined) rule.rewards = rewards;
    if (ruleSetId !== undefined) rule.ruleSetId = ruleSetId;

    await rule.save();

    // Populate rule references for clean response
    const populated = await ScratchCardRule.findById(rule._id)
      .populate("tierId")
      .populate("giftId")
      .populate("gifts.giftId")
      .populate({
        path: "rewards.giftId",
        populate: {
          path: "categoryId",
        },
      })
      .lean();

    return {
      success: true,
      message: "Scratch card rule updated successfully",
      data: populated,
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.deleteScratchCardRule = async (id) => {
  try {
    const rule = await ScratchCardRule.findByIdAndDelete(id);
    if (!rule)
      return { success: false, message: "Scratch card rule not found" };
    return { success: true, message: "Scratch card rule deleted successfully" };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

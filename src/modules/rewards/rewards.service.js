const mongoose = require("mongoose");
const Product = require("../../schemas/product.schema");
const Reward = require("../../schemas/reward.schema");
const RewardBatch = require("../../schemas/reward-batch.schema");
const Gift = require("../../schemas/gift.schema");
const User = require("../../schemas/user.schema");
const giftService = require("../gift/gift.service");
const loyaltyService = require("../loyalty/loyalty.service");
const { LOYALTY_TRANSACTION_SOURCES } = require("../../constants/loyalty");
const { MAX_REWARD_BATCH_SIZE } = require("../../constants/rewards");
const {
  randomHex,
  attachId,
  makeRewardBatchUidPrefix,
} = require("../../utils/heplers");
const { sendFailResponse } = require("../../utils/responseHandlers");

async function listRewards(data) {
  const {
    page = 1,
    limit = 20,
    search = "", // search by UID or Product name
    sortBy = "createdAt",
    sortOrder = "desc",
    filters = {},
  } = data;

  const skip = (page - 1) * limit;

  let query = { isDeleted: { $ne: true } };

  if (data?.productId) {
    query.productId = data.productId;
  }

  if (data?.batchId) {
    query.batchId = new mongoose.Types.ObjectId(data.batchId);
  }

  if (filters.active !== undefined) {
    query.active = filters.active;
  }

  if (filters.isRedeemed !== undefined) {
    query.isRedeemed = filters.isRedeemed;
  }

  if (filters.minPoints !== undefined || filters.maxPoints !== undefined) {
    query.point = {};
    if (filters.minPoints !== undefined)
      query.point.$gte = Number(filters.minPoints);
    if (filters.maxPoints !== undefined)
      query.point.$lte = Number(filters.maxPoints);
  }

  // Filter by expiration date range
  if (filters.expiresBefore || filters.expiresAfter) {
    query.expiresAt = {};
    if (filters.expiresAfter)
      query.expiresAt.$gte = new Date(filters.expiresAfter);
    if (filters.expiresBefore)
      query.expiresAt.$lte = new Date(filters.expiresBefore);
  }

  // Filter by creation date or range, supporting legacy documents that don't have createdAt
  if (filters.createdDate) {
    const startOfDay = new Date(filters.createdDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(filters.createdDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const startId = mongoose.Types.ObjectId.createFromTime(
      Math.floor(startOfDay.getTime() / 1000),
    );
    const endId = mongoose.Types.ObjectId.createFromTime(
      Math.floor(endOfDay.getTime() / 1000),
    );

    query.$or = [
      { createdAt: { $gte: startOfDay, $lte: endOfDay } },
      {
        createdAt: { $exists: false },
        _id: { $gte: startId, $lte: endId },
      },
    ];
  } else if (filters.createdAtAfter || filters.createdAtBefore) {
    const conditions = [];
    let start, end;
    if (filters.createdAtAfter) {
      start = new Date(filters.createdAtAfter);
      conditions.push({ createdAt: { $gte: start } });
    }
    if (filters.createdAtBefore) {
      end = new Date(filters.createdAtBefore);
      conditions.push({ createdAt: { $lte: end } });
    }

    if (start || end) {
      const idQuery = {};
      if (start) {
        idQuery.$gte = mongoose.Types.ObjectId.createFromTime(
          Math.floor(start.getTime() / 1000),
        );
      }
      if (end) {
        idQuery.$lte = mongoose.Types.ObjectId.createFromTime(
          Math.floor(end.getTime() / 1000),
        );
      }

      query.$or = [
        {
          $and: conditions,
        },
        {
          createdAt: { $exists: false },
          _id: idQuery,
        },
      ];
    }
  }

  //  Search by uidCode or Product name
  if (search) {
    query.$or = [{ uidCode: { $regex: search, $options: "i" } }];
  }

  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  // Fetch rewards with product populated
  const rewards = await Reward.find(query)
    .populate("product")
    .populate("batchId", "batchUid batchNumber createdAt")
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  const rewardsWithId = attachId(rewards).map((reward) => {
    const batch = reward.batchId;
    return {
      ...reward,
      batchId: batch?._id || batch || null,
      batchUid: batch?.batchUid,
      batchNumber: batch?.batchNumber,
      batchCreatedAt: batch?.createdAt,
    };
  });
  const totalDocuments = await Reward.countDocuments(query);

  return {
    data: {
      rewards: rewardsWithId,
      page,
      limit,
      totalPages: Math.ceil(totalDocuments / limit),
      total: totalDocuments,
    },
  };
}

async function listRewardBatches(data = {}) {
  const {
    page = 1,
    limit = 20,
    productId,
    search,
    startDate,
    endDate,
    activityStatus,
    status = "complete",
  } = data;
  const query = { isDeleted: { $ne: true } };
  if (productId) query.productId = new mongoose.Types.ObjectId(productId);
  if (status) query.status = status;
  if (activityStatus === "active") query.activeCount = { $gt: 0 };
  if (activityStatus === "inactive") query.inactiveCount = { $gt: 0 };
  if (search) {
    const safeSearch = search.trim().toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.batchUid = { $regex: `^${safeSearch}` };
  }
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      if (endDate.length === 10) end.setUTCHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const [batches, total] = await Promise.all([
    RewardBatch.find(query)
      .populate("productId", "name")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    RewardBatch.countDocuments(query),
  ]);
  const batchesWithProduct = batches.map(({ productId: product, ...batch }) => ({
    ...batch,
    productId: product?._id || product,
    product: product || null,
  }));
  return {
    data: {
      batches: batchesWithProduct,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getRewardBatch(batchId) {
  if (!mongoose.isValidObjectId(batchId)) sendFailResponse("invalid reward batch id", 400);
  const batch = await RewardBatch.findOne({ _id: batchId, isDeleted: { $ne: true } })
    .populate("productId", "name")
    .lean();
  if (!batch) sendFailResponse("reward batch not found", 404);
  const product = batch.productId;
  return {
    data: { ...batch, productId: product?._id || product, product: product || null },
  };
}

async function listRewardsByBatch(batchId, data = {}) {
  if (!mongoose.isValidObjectId(batchId)) sendFailResponse("invalid reward batch id", 400);
  const batch = await RewardBatch.findOne({ _id: batchId, isDeleted: { $ne: true } }).lean();
  if (!batch) sendFailResponse("reward batch not found", 404);
  const result = await listRewards({ ...data, batchId });
  return { data: { batch, ...result.data } };
}

async function deactivateRewardBatch(batchId) {
  if (!mongoose.isValidObjectId(batchId)) sendFailResponse("invalid reward batch id", 400);
  let deactivatedCount = 0;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const batch = await RewardBatch.findOne({ _id: batchId, isDeleted: { $ne: true } })
        .session(session)
        .lean();
      if (!batch) sendFailResponse("reward batch not found", 404);

      const result = await Reward.updateMany(
        { batchId, active: { $ne: false }, isDeleted: { $ne: true } },
        { $set: { active: false } },
        { session },
      );
      deactivatedCount = result.matchedCount ?? result.n ?? 0;
      if (deactivatedCount) {
        await RewardBatch.updateOne(
          { _id: batchId },
          { $inc: { activeCount: -deactivatedCount, inactiveCount: deactivatedCount } },
          { session },
        );
      }
    });
  } finally {
    await session.endSession();
  }
  return {
    message: "reward batch deactivated",
    data: { deactivatedCount },
  };
}

async function updateRewardBatch(batchId, updateData = {}) {
  if (!mongoose.isValidObjectId(batchId)) sendFailResponse("invalid reward batch id", 400);
  const { rewardPoints } = updateData;
  const expiresAt = updateData.expiresAt || updateData.endDate;
  if (expiresAt) {
    const expiryTime = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiryTime) || expiryTime <= Date.now()) {
      sendFailResponse("new expiry date must be in the future", 400);
    }
  }
  const update = {};
  if (expiresAt) update.expiresAt = new Date(expiresAt);
  if (rewardPoints !== undefined) update.point = rewardPoints;

  const batch = await RewardBatch.findOne({ _id: batchId, isDeleted: { $ne: true } }).lean();
  if (!batch) sendFailResponse("reward batch not found", 404);
  const result = await Reward.updateMany(
    { batchId, isRedeemed: { $ne: true }, isDeleted: { $ne: true } },
    { $set: update },
  );
  return {
    message: "reward batch updated",
    data: {
      matchedCount: result.matchedCount ?? result.n ?? 0,
      modifiedCount: result.modifiedCount ?? result.nModified ?? 0,
      scannedRewardsSkipped: batch.totalCount - (result.matchedCount ?? result.n ?? 0),
    },
  };
}

async function deleteRewardBatch(batchId) {
  if (!mongoose.isValidObjectId(batchId)) sendFailResponse("invalid reward batch id", 400);
  let physicallyDeletedCount = 0;
  let softDeletedCount = 0;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const batch = await RewardBatch.findOne({ _id: batchId, isDeleted: { $ne: true } })
        .session(session)
        .lean();
      if (!batch) sendFailResponse("reward batch not found", 404);

      const deletedAt = new Date();
      const softDeleteResult = await Reward.updateMany(
        { batchId, active: false, isDeleted: { $ne: true } },
        { $set: { isDeleted: true, deletedAt } },
        { session },
      );
      softDeletedCount = softDeleteResult.modifiedCount ?? softDeleteResult.nModified ?? 0;

      const hardDeleteResult = await Reward.deleteMany(
        { batchId, active: { $ne: false }, isDeleted: { $ne: true } },
        { session },
      );
      physicallyDeletedCount = hardDeleteResult.deletedCount ?? hardDeleteResult.n ?? 0;

      await RewardBatch.updateOne(
        { _id: batchId },
        { $set: { isDeleted: true, deletedAt } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  return {
    message: "reward batch deleted",
    data: { physicallyDeletedCount, softDeletedCount },
  };
}

async function markRewardRedeemed(rewardId, userId) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const reward = await Reward.findById(rewardId).session(session).lean();
      if (!reward || reward.isRedeemed || reward.isDeleted) return;
      await Reward.findByIdAndUpdate(
        rewardId,
        { $set: { isRedeemed: true, redeemedAt: new Date(), redeemedBy: userId, active: false } },
        { session },
      );
      if (reward.batchId && reward.active !== false) {
        await updateBatchStatusCounts(reward.batchId, -1, 1, session);
      }
    });
  } finally {
    await session.endSession();
  }
}

async function updateBatchStatusCounts(batchId, activeDelta, inactiveDelta, session) {
  if (!batchId || (!activeDelta && !inactiveDelta)) return;
  await RewardBatch.updateOne(
    { _id: batchId },
    { $inc: { activeCount: activeDelta, inactiveCount: inactiveDelta } },
    session ? { session } : {},
  );
}

async function listRewardsGroupedByDate(data) {
  const {
    page = 1,
    limit = 20,
    productId,
    startDate,
    endDate,
    filters = {},
  } = data;
  const skip = (page - 1) * limit;

  const matchQuery = { isDeleted: { $ne: true } };

  if (productId) {
    matchQuery.productId = new mongoose.Types.ObjectId(productId);
  }

  if (filters.active !== undefined) {
    matchQuery.active = filters.active;
  }

  // Handle date range constraints (supporting legacy docs using _id fallback)
  const rangeConditions = [];
  let start, end;
  if (startDate) {
    start = new Date(startDate);
    rangeConditions.push({ createdAt: { $gte: start } });
  }
  if (endDate) {
    end = new Date(endDate);
    if (endDate.length === 10) {
      end.setUTCHours(23, 59, 59, 999);
    }
    rangeConditions.push({ createdAt: { $lte: end } });
  }

  if (start || end) {
    const idQuery = {};
    if (start) {
      idQuery.$gte = mongoose.Types.ObjectId.createFromTime(
        Math.floor(start.getTime() / 1000),
      );
    }
    if (end) {
      idQuery.$lte = mongoose.Types.ObjectId.createFromTime(
        Math.floor(end.getTime() / 1000),
      );
    }

    matchQuery.$or = [
      { $and: rangeConditions },
      {
        createdAt: { $exists: false },
        _id: idQuery,
      },
    ];
  }

  const pipeline = [
    { $match: matchQuery },
    {
      $project: {
        actualCreatedAt: { $ifNull: ["$createdAt", { $toDate: "$_id" }] },
        active: 1,
        productId: 1,
      },
    },
    {
      $project: {
        date: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$actualCreatedAt",
            timezone: "UTC",
          },
        },
        active: 1,
        productId: 1,
      },
    },
    {
      $group: {
        _id: { date: "$date", productId: "$productId" },
        activeCount: {
          $sum: { $cond: [{ $eq: ["$active", true] }, 1, 0] },
        },
        inactiveCount: {
          $sum: { $cond: [{ $eq: ["$active", false] }, 1, 0] },
        },
        totalCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "_id.productId",
        foreignField: "_id",
        as: "product",
      },
    },
    {
      $unwind: {
        path: "$product",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: { $concat: ["$_id.date", "|", { $toString: "$_id.productId" }] },
        date: "$_id.date",
        productId: "$_id.productId",
        product: 1,
        activeCount: 1,
        inactiveCount: 1,
        totalCount: 1,
      },
    },
    { $sort: { date: -1 } },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  const result = await Reward.aggregate(pipeline);
  const total = result[0]?.metadata[0]?.total || 0;
  const dates = result[0]?.data || [];

  return {
    data: {
      dates,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      total,
    },
  };
}

async function rewardDetails(rewardId) {
  const reward = await Reward.findOne({ _id: rewardId, isDeleted: { $ne: true } })
    .populate("product")
    .populate("batchId", "batchUid batchNumber createdAt")
    .lean();
  if (!reward) sendFailResponse("reward not found");
  const batch = reward.batchId;
  return {
    data: {
      ...reward,
      batchId: batch?._id || batch || null,
      batchUid: batch?.batchUid,
      batchNumber: batch?.batchNumber,
      batchCreatedAt: batch?.createdAt,
    },
  };
}

async function createRewards(rewardData) {
  const { expiresAt, productId, count } = rewardData;

  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_REWARD_BATCH_SIZE
  ) {
    sendFailResponse(
      `For a single batch, a maximum of ${MAX_REWARD_BATCH_SIZE} rewards is allowed to create.`,
      400,
    );
  }

  const product = await Product.findById(productId).lean();
  if (!product) sendFailResponse("product not found");

  const sequencedProduct = await Product.findByIdAndUpdate(
    productId,
    { $inc: { rewardBatchSequence: 1 } },
    { new: true, select: "name rewardBatchSequence" },
  ).lean();
  if (!sequencedProduct) sendFailResponse("product not found");
  const batchNumber = sequencedProduct.rewardBatchSequence;
  const batchUid = `${makeRewardBatchUidPrefix(product.name)}_${String(batchNumber).padStart(2, "0")}`;

  // Calculate the expiry with the 90-day buffer
  const expiresAtWithBuffer = new Date(expiresAt);
  expiresAtWithBuffer.setDate(expiresAtWithBuffer.getDate() + 90);

  const generateComplexRewardUID = () => {
    // Generate a short, human-readable 8-character alphanumeric code for easier manual entry
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // excluded easily confused chars (I, O, 1, 0)
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // E.g., A7X9M2B4
    return code;
  };
  const batch = await RewardBatch.create({
    batchUid,
    batchNumber,
    productId,
    totalCount: count,
    activeCount: count,
    inactiveCount: 0,
    status: "creating",
  });
  const structuredRewards = [];

  for (let i = 0; i < count; i++) {
    const rewardUID = generateComplexRewardUID();
    const reward = {
      productId,
      batchId: batch._id,
      expiresAt: expiresAtWithBuffer,
      uidCode: rewardUID,
      point: product.rewardPoints,
    };
    structuredRewards.push(reward);
  }

  if (!structuredRewards.length) sendFailResponse("failed to generate rewards");
  try {
    await Reward.insertMany(structuredRewards);
    await RewardBatch.updateOne({ _id: batch._id }, { $set: { status: "complete" } });
  } catch (error) {
    const insertedCounts = await Reward.aggregate([
      { $match: { batchId: batch._id } },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          activeCount: { $sum: { $cond: [{ $ne: ["$active", false] }, 1, 0] } },
        },
      },
    ]);
    const actual = insertedCounts[0] || { totalCount: 0, activeCount: 0 };
    await RewardBatch.updateOne(
      { _id: batch._id },
      {
        $set: {
          status: "failed",
          totalCount: actual.totalCount,
          activeCount: actual.activeCount,
          inactiveCount: actual.totalCount - actual.activeCount,
        },
      },
    );
    throw error;
  }
  return {
    message: `Created ${count} rewards`,
    data: { rewardsAdded: true, batchId: batch._id, batchUid, totalCount: count },
  };
}

async function updateReward(rewardData, rewardId) {
  const { expiresAt, rewardPoints, active } = rewardData;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const previous = await Reward.findById(rewardId).session(session).lean();
      if (!previous || previous.isDeleted) return;

      await Reward.findByIdAndUpdate(
        rewardId,
        { expiresAt, point: rewardPoints, active },
        { session },
      );

      const previousActive = previous.active !== false;
      if (previous.batchId && previousActive !== active) {
        await updateBatchStatusCounts(
          previous.batchId,
          active ? 1 : -1,
          active ? -1 : 1,
          session,
        );
      }
    });
  } finally {
    await session.endSession();
  }
  return { message: "reward updated", data: { rewardsUpdated: true } };
}

async function _executeBulkUpdateRewards({
  rewardIds,
  rewardPoints,
  expiresAt,
}) {
  const updateFields = {};
  if (rewardPoints !== undefined) {
    updateFields.point = rewardPoints;
  }
  if (expiresAt !== undefined) {
    updateFields.expiresAt = new Date(expiresAt);
  }

  if (Object.keys(updateFields).length === 0) {
    sendFailResponse("No update fields provided");
  }

  if (!rewardIds || rewardIds.length === 0) {
    return {
      message: "no rewards found to update",
      data: {
        matchedCount: 0,
        modifiedCount: 0,
        rewardsUpdated: false,
      },
    };
  }

  const result = await Reward.updateMany(
    {
      _id: { $in: rewardIds },
      active: { $ne: false },
    },
    {
      $set: updateFields,
    },
  );

  return {
    message: "rewards updated",
    data: {
      matchedCount: result.matchedCount ?? result.n ?? 0,
      modifiedCount: result.modifiedCount ?? result.nModified ?? 0,
      rewardsUpdated: true,
    },
  };
}

async function bulkUpdateRewards(rewardData) {
  const { rewardIds, rewardPoints, expiresAt } = rewardData;
  return _executeBulkUpdateRewards({ rewardIds, rewardPoints, expiresAt });
}

async function batchUpdateRewards(batchData) {
  const { productId, createdDate, rewardPoints, expiresAt, batchId } = batchData;

  if (batchId) {
    const result = await Reward.updateMany(
      { batchId: new mongoose.Types.ObjectId(batchId), active: { $ne: false } },
      { $set: { ...(rewardPoints !== undefined ? { point: rewardPoints } : {}), ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}) } },
    );
    const matchedCount = result.matchedCount ?? result.n ?? 0;
    return { message: "rewards updated", data: { matchedCount, modifiedCount: result.modifiedCount ?? result.nModified ?? 0, rewardsUpdated: matchedCount > 0 } };
  }

  const startOfDay = new Date(createdDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(createdDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const startId = mongoose.Types.ObjectId.createFromTime(
    Math.floor(startOfDay.getTime() / 1000),
  );
  const endId = mongoose.Types.ObjectId.createFromTime(
    Math.floor(endOfDay.getTime() / 1000),
  );

  const query = {
    productId: new mongoose.Types.ObjectId(productId),
    active: { $ne: false },
    $or: [
      { createdAt: { $gte: startOfDay, $lte: endOfDay } },
      {
        createdAt: { $exists: false },
        _id: { $gte: startId, $lte: endId },
      },
    ],
  };

  const rewards = await Reward.find(query, { _id: 1 }).lean();
  const rewardIds = rewards.map((r) => r._id);

  if (rewardIds.length === 0) {
    return {
      message: "no active rewards found for the specified batch",
      data: {
        matchedCount: 0,
        modifiedCount: 0,
        rewardsUpdated: false,
      },
    };
  }

  return  await _executeBulkUpdateRewards({ rewardIds, rewardPoints, expiresAt });
}

async function deleteReward(rewardId) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const reward = await Reward.findByIdAndDelete(rewardId, { session });
      if (reward?.batchId) {
        await RewardBatch.updateOne(
          { _id: reward.batchId },
          {
            $inc: {
              totalCount: -1,
              ...(reward.active !== false
                ? { activeCount: -1 }
                : { inactiveCount: -1 }),
            },
          },
          { session },
        );
      }
    });
  } finally {
    await session.endSession();
  }
  return { message: "reward deleted", data: { rewardDeleted: true } };
}

async function deleteAllReward() {
  await Reward.deleteMany({});
  await RewardBatch.deleteMany({});
  return { message: "all rewards deleted", data: { rewardsDeleted: true } };
}

/**
 * Awards a reward (either POINTS, COINS, or GIFT) to a user globally.
 * Uses lazy requiring of other services to prevent circular dependencies.
 *
 * @param {string} userId
 * @param {object} rewardDetails - { type: "POINTS"|"GIFT", amount: number, giftId: string }
 * @param {object} sourceDetails - { cause: string, causeId: string, causeTitle: string, referenceId: string }
 * @param {ClientSession} session - Optional MongoDB session
 * @returns {Promise<object>} Award result { success: boolean, ... }
 */
async function awardRewardToUser(
  userId,
  rewardDetails,
  sourceDetails,
  session = null,
) {
  const { type, amount, giftId } = rewardDetails;
  const { cause, causeId, causeTitle, referenceId } = sourceDetails;

  if (type === "GIFT" || type === "PHYSICAL_GIFT") {
    let giftQuery = Gift.findById(giftId);
    if (giftQuery && session && typeof giftQuery.session === "function") {
      giftQuery = giftQuery.session(session);
    }
    const gift = await giftQuery;
    if (!gift) {
      return { success: false, message: "Gift not found" };
    }

    const causeData = {
      rewardCause: cause,
      rewardCauseId: causeId,
      rewardCauseTitle: causeTitle,
      redeemId: referenceId,
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10-day default claim window
    };

    return giftService.awardGiftToUser(userId, gift, causeData, session);
  }

  if (type === "POINTS") {
    let loyaltySource = LOYALTY_TRANSACTION_SOURCES.CAMPAIGN_BONUS;
    if (cause === "SCRATCH_CARD") {
      loyaltySource = LOYALTY_TRANSACTION_SOURCES.SCRATCH_CARD_BONUS;
    }
    if (cause === "SEASON_TIER_REWARD") {
      loyaltySource = LOYALTY_TRANSACTION_SOURCES.TIER_RANK_UP;
    }

    const options = {
      skipQpSync: true, // Bonus points do not contribute to tier upgrades
      skipLifetimePoints: true,
      source: loyaltySource,
    };
    await loyaltyService.addBonusPoints(
      userId,
      amount,
      causeTitle || "Campaign bonus points",
      referenceId,
      options,
      ...(session ? [session] : []),
    );

    return { success: true, pointsAwarded: amount };
  }

  if (
    type === "COIN" ||
    type === "COINS" ||
    type === "HYDACOIN" ||
    type === "HYDACON_COIN"
  ) {
    const coinsToAward = Number(amount) || 0;
    let userQuery = User.findByIdAndUpdate(
      userId,
      {
        $inc: {
          hydaconCoins: coinsToAward,
          lifetimeHydaconCoins: coinsToAward,
        },
      },
      { new: true },
    );
    if (session && typeof userQuery.session === "function") {
      userQuery = userQuery.session(session);
    }
    const updatedUser = await userQuery;

    return {
      success: true,
      coinsAwarded: coinsToAward,
      currentCoins: updatedUser?.hydaconCoins || 0,
    };
  }

  return { success: false, message: "Unsupported reward type" };
}

module.exports = {
  listRewards,
  listRewardBatches,
  getRewardBatch,
  listRewardsByBatch,
  deactivateRewardBatch,
  updateRewardBatch,
  deleteRewardBatch,
  markRewardRedeemed,
  listRewardsGroupedByDate,
  rewardDetails,
  createRewards,
  updateReward,
  bulkUpdateRewards,
  batchUpdateRewards,
  deleteReward,
  deleteAllReward,
  awardRewardToUser,
};

const mongoose = require("mongoose");
const Product = require("../../schemas/product.schema");
const Reward = require("../../schemas/reward.schema");
const { randomHex, attachId } = require("../../utils/heplers");
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

  let query = {};

  if (data?.productId) {
    query.productId = data.productId;
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
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  const rewardsWithId = attachId(rewards);
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

async function listRewardsGroupedByDate(data) {
  const { page = 1, limit = 20, productId, startDate, endDate, filters = {} } = data;
  const skip = (page - 1) * limit;

  const matchQuery = {};

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
      },
    },
    {
      $group: {
        _id: "$date",
        activeCount: {
          $sum: { $cond: [{ $eq: ["$active", true] }, 1, 0] },
        },
        inactiveCount: {
          $sum: { $cond: [{ $eq: ["$active", false] }, 1, 0] },
        },
        totalCount: { $sum: 1 },
      },
    },
    { $sort: { _id: -1 } },
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
  const reward = await Reward.findById(rewardId).populate("product").lean();
  if (!reward) sendFailResponse("reward not found");
  return { data: reward };
}

async function createRewards(rewardData) {
  const { expiresAt, productId, count } = rewardData;

  const product = await Product.findById(productId).lean();
  if (!product) sendFailResponse("product not found");

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
  const structuredRewards = [];

  for (let i = 0; i < count; i++) {
    const rewardUID = generateComplexRewardUID();
    const reward = {
      productId,
      expiresAt: expiresAtWithBuffer,
      uidCode: rewardUID,
      point: product.rewardPoints,
    };
    structuredRewards.push(reward);
  }

  if (!structuredRewards.length) sendFailResponse("failed to generate rewards");
  await Reward.insertMany(structuredRewards);
  return { message: `Created ${count} rewards`, data: { rewardsAdded: true } };
}

async function updateReward(rewardData, rewardId) {
  const { expiresAt, rewardPoints, active } = rewardData;
  await Reward.findByIdAndUpdate(rewardId, {
    expiresAt,
    point: rewardPoints,
    active: active,
  });
  return { message: "reward updated", data: { rewardsUpdated: true } };
}

async function deleteReward(rewardId) {
  await Reward.findByIdAndDelete(rewardId);
  return { message: "reward deleted", data: { rewardDeleted: true } };
}

async function deleteAllReward() {
  await Reward.deleteMany({});
  return { message: "all rewards deleted", data: { rewardsDeleted: true } };
}

module.exports = {
  listRewards,
  listRewardsGroupedByDate,
  rewardDetails,
  createRewards,
  updateReward,
  deleteReward,
  deleteAllReward,
};

require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const mongoose = require("mongoose");
const Reward = require("../schemas/reward.schema");
const RewardBatch = require("../schemas/reward-batch.schema");
const Product = require("../schemas/product.schema");
const { makeRewardBatchUidPrefix } = require("../utils/heplers");
const REWARD_MIGRATION_INDEX = "reward_batch_backfill_lookup";

function getBatchDateRange(dateString) {
  const start = new Date(`${dateString}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function makeGroupRewardQuery(productId, batchDate) {
  const { start, end } = getBatchDateRange(batchDate);
  const startId = mongoose.Types.ObjectId.createFromTime(
    Math.floor(start.getTime() / 1000),
  );
  const endId = mongoose.Types.ObjectId.createFromTime(
    Math.floor(end.getTime() / 1000),
  );
  const idDateRange = { $gte: startId, $lt: endId };

  return {
    productId,
    batchId: null,
    $or: [
      { createdAt: { $gte: start, $lt: end } },
      { createdAt: { $exists: false }, _id: idDateRange },
      { createdAt: null, _id: idDateRange },
    ],
  };
}

async function getOrCreateMigrationBatch(productId, batchDate) {
  const migrationKey = `${productId.toString()}:${batchDate}`;
  let batch = await RewardBatch.findOne({ migrationKey });
  if (batch) return batch;

  const sequencedProduct = await Product.findByIdAndUpdate(
    productId,
    { $inc: { rewardBatchSequence: 1 } },
    { new: true, select: "name rewardBatchSequence" },
  ).lean();
  const batchNumber = sequencedProduct
    ? sequencedProduct.rewardBatchSequence
    : (await RewardBatch.countDocuments({ productId })) + 1;
  const batchUid = `${makeRewardBatchUidPrefix(sequencedProduct?.name)}_${String(batchNumber).padStart(2, "0")}`;
  const { start } = getBatchDateRange(batchDate);

  try {
    batch = await RewardBatch.create({
      batchUid,
      batchNumber,
      migrationKey,
      productId,
      totalCount: 0,
      activeCount: 0,
      inactiveCount: 0,
      status: "complete",
      createdAt: start,
      updatedAt: start,
    });
    return batch;
  } catch (error) {
    // A concurrent rerun may have inserted this deterministic migration group.
    if (error?.code === 11000) {
      batch = await RewardBatch.findOne({ migrationKey });
      if (batch) return batch;
    }
    throw error;
  }
}

async function backfillExistingBatchUids() {
  const maxBatchNumberByProduct = new Map();
  const existingMaximums = await RewardBatch.aggregate([
    { $match: { batchNumber: { $type: "number" } } },
    { $group: { _id: "$productId", maxBatchNumber: { $max: "$batchNumber" } } },
  ]);
  for (const { _id: productId, maxBatchNumber } of existingMaximums) {
    maxBatchNumberByProduct.set(productId.toString(), maxBatchNumber);
  }
  if (existingMaximums.length) {
    await Product.bulkWrite(
      existingMaximums.map(({ _id: productId, maxBatchNumber }) => ({
        updateOne: {
          filter: { _id: productId },
          update: { $max: { rewardBatchSequence: maxBatchNumber } },
        },
      })),
    );
  }

  const cursor = RewardBatch.find({
    $or: [
      { batchUid: { $exists: false } },
      { batchUid: null },
      { batchNumber: { $exists: false } },
      { batchNumber: null },
    ],
  })
    .sort({ productId: 1, createdAt: 1, _id: 1 })
    .cursor({ batchSize: 250 });

  for await (const batch of cursor) {
    const productId = batch.productId;
    let batchNumber = batch.batchNumber;
    let productName;

    if (!Number.isInteger(batchNumber) || batchNumber < 1) {
      const product = await Product.findByIdAndUpdate(
        productId,
        { $inc: { rewardBatchSequence: 1 } },
        { new: true, select: "name rewardBatchSequence" },
      ).lean();
      if (product) {
        batchNumber = product.rewardBatchSequence;
        productName = product.name;
      } else {
        const productKey = productId.toString();
        batchNumber = (maxBatchNumberByProduct.get(productKey) || 0) + 1;
        maxBatchNumberByProduct.set(productKey, batchNumber);
      }
    } else {
      const product = await Product.findById(productId).select("name").lean();
      productName = product?.name;
    }
    maxBatchNumberByProduct.set(
      productId.toString(),
      Math.max(
        maxBatchNumberByProduct.get(productId.toString()) || 0,
        batchNumber,
      ),
    );

    const batchUid =
      batch.batchUid ||
      `${makeRewardBatchUidPrefix(productName)}_${String(batchNumber).padStart(2, "0")}`;
    await RewardBatch.updateOne(
      { _id: batch._id },
      { $set: { batchUid, batchNumber, status: "complete" } },
    );
  }
  await cursor.close();
}

async function updateBatchCounts(batchId) {
  const [counts = { totalCount: 0, activeCount: 0 }] = await Reward.aggregate([
    { $match: { batchId } },
    {
      $group: {
        _id: null,
        totalCount: { $sum: 1 },
        activeCount: {
          $sum: { $cond: [{ $ne: ["$active", false] }, 1, 0] },
        },
      },
    },
  ]);

  await RewardBatch.updateOne(
    { _id: batchId },
    {
      $set: {
        totalCount: counts.totalCount,
        activeCount: counts.activeCount,
        inactiveCount: counts.totalCount - counts.activeCount,
        status: "complete",
      },
    },
  );
  return counts.totalCount;
}

async function reconcileMigrationBatchCounts() {
  const cursor = RewardBatch.find({}, { _id: 1 })
    .lean()
    .cursor({ batchSize: 500 });
  let batchChunk = [];

  async function reconcileChunk(batches) {
    if (!batches.length) return;
    const ids = batches.map((batch) => batch._id);
    const counts = await Reward.aggregate([
      { $match: { batchId: { $in: ids } } },
      {
        $group: {
          _id: "$batchId",
          totalCount: { $sum: 1 },
          activeCount: {
            $sum: { $cond: [{ $ne: ["$active", false] }, 1, 0] },
          },
        },
      },
    ]);
    const batchCounts = new Map(
      counts.map((count) => [count._id.toString(), count]),
    );

    await RewardBatch.bulkWrite(
      ids.map((id) => {
        const count = batchCounts.get(id.toString()) || {
          totalCount: 0,
          activeCount: 0,
        };
        return {
          updateOne: {
            filter: { _id: id },
            update: {
              $set: {
                totalCount: count.totalCount,
                activeCount: count.activeCount,
                inactiveCount: count.totalCount - count.activeCount,
                status: "complete",
              },
            },
          },
        };
      }),
    );
  }

  try {
    for await (const batch of cursor) {
      batchChunk.push(batch);
      if (batchChunk.length === 500) {
        await reconcileChunk(batchChunk);
        batchChunk = [];
      }
    }
    await reconcileChunk(batchChunk);
  } finally {
    await cursor.close();
  }
}

async function migrateRewardBatches() {
  if (!process.env.MONGODB_URL) {
    throw new Error("MONGODB_URL is required to run this migration");
  }

  await mongoose.connect(process.env.MONGODB_URL);
  await RewardBatch.collection.createIndex(
    { productId: 1, batchNumber: 1 },
    { unique: true },
  );
  await RewardBatch.collection.createIndex(
    { productId: 1, batchUid: 1 },
    { unique: true },
  );
  await RewardBatch.collection.createIndex(
    { migrationKey: 1 },
    { unique: true, sparse: true },
  );
  await Reward.collection.createIndex(
    { batchId: 1, productId: 1, createdAt: 1, _id: 1 },
    { name: REWARD_MIGRATION_INDEX },
  );
  console.log(
    "Connected to MongoDB. Grouping unbatched rewards by UTC date and product...",
  );
  await backfillExistingBatchUids();

  const cursor = Reward.aggregate([
    { $match: { batchId: null, productId: { $type: "objectId" } } },
    {
      $project: {
        productId: 1,
        createdDate: {
          $ifNull: ["$createdAt", { $toDate: "$_id" }],
        },
        active: 1,
      },
    },
    {
      $project: {
        productId: 1,
        batchDate: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$createdDate",
            timezone: "UTC",
          },
        },
        active: 1,
      },
    },
    {
      $group: {
        _id: { productId: "$productId", batchDate: "$batchDate" },
        rewardCount: { $sum: 1 },
      },
    },
    { $sort: { "_id.productId": 1, "_id.batchDate": 1 } },
  ])
    .allowDiskUse(true)
    .cursor({ batchSize: 250 });

  let groupCount = 0;
  let rewardCount = 0;
  for await (const group of cursor) {
    const { productId, batchDate } = group._id;
    const batch = await getOrCreateMigrationBatch(productId, batchDate);
    await Reward.updateMany(makeGroupRewardQuery(productId, batchDate), {
      $set: { batchId: batch._id },
    });
    const assignedCount = await updateBatchCounts(batch._id);
    groupCount += 1;
    rewardCount += assignedCount;
    console.log(
      `Processed ${batch.batchUid}: ${assignedCount} rewards for ${batchDate} (${productId})`,
    );
  }

  await cursor.close();
  await reconcileMigrationBatchCounts();
  await Reward.collection.dropIndex(REWARD_MIGRATION_INDEX);
  console.log(
    `Migration complete: ${groupCount} batches, ${rewardCount} rewards assigned.`,
  );
}

if (require.main === module) {
  migrateRewardBatches()
    .catch((error) => {
      console.error("Reward batch migration failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
}

module.exports = {
  getBatchDateRange,
  makeGroupRewardQuery,
  migrateRewardBatches,
};

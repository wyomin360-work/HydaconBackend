require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const mongoose = require("mongoose");
const Product = require("../schemas/product.schema");
const Reward = require("../schemas/reward.schema");
const RewardBatch = require("../schemas/reward-batch.schema");
const {
  normalizeProductName,
  makeVoucherUid,
} = require("../utils/voucher-identity");

const BATCH_SIZE = 500;

async function skipEmptyBatchOrThrow(batch, reason) {
  const rewardCount = await Reward.countDocuments({ batchId: batch._id });
  if (rewardCount === 0) {
    console.warn(
      `Skipping batch ${batch._id}: it has no rewards and needs no voucher UIDs.`,
    );
    return true;
  }
  throw new Error(reason);
}

async function inspectProductNames() {
  const products = await Product.find({}).select("_id name nameKey").lean();
  const productKeys = new Map();
  for (const product of products) {
    const nameKey = normalizeProductName(product.name);
    const duplicates = productKeys.get(nameKey) || [];
    duplicates.push({ id: String(product._id), name: product.name });
    productKeys.set(nameKey, duplicates);
  }
  const conflicts = [...productKeys.entries()].filter(
    ([, items]) => items.length > 1,
  );
  if (conflicts.length) {
    const details = conflicts
      .map(
        ([key, items]) =>
          `${key}: ${items.map((item) => `${item.name} (${item.id})`).join(", ")}`,
      )
      .join("\n");
    throw new Error(
      `Product names collide after filename normalization:\n${details}`,
    );
  }
  return products.map((product) => ({
    _id: product._id,
    nameKey: normalizeProductName(product.name),
  }));
}

async function inspectExistingVoucherUids() {
  const duplicates = await Reward.aggregate([
    { $match: { voucherUid: { $type: "string" } } },
    {
      $group: {
        _id: "$voucherUid",
        count: { $sum: 1 },
        rewardIds: { $push: "$_id" },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 },
  ]);
  if (duplicates.length) {
    throw new Error(
      `Existing voucher UIDs are duplicated: ${duplicates
        .map(({ _id, rewardIds }) => `${_id} (${rewardIds.join(", ")})`)
        .join("; ")}`,
    );
  }
}

async function planBatchRewards(batch, productName, apply) {
  const cursor = Reward.find({ batchId: batch._id })
    .select("_id createdAt voucherNumber voucherUid")
    .sort({ createdAt: 1, _id: 1 })
    .lean()
    .cursor({ batchSize: BATCH_SIZE });
  const usedNumbers = new Set();
  const usedUids = new Set();
  const missing = [];
  try {
    for await (const reward of cursor) {
      if (Number.isInteger(reward.voucherNumber) && reward.voucherNumber > 0) {
        if (usedNumbers.has(reward.voucherNumber)) {
          throw new Error(
            `Duplicate voucher number ${reward.voucherNumber} in batch ${batch._id}`,
          );
        }
        usedNumbers.add(reward.voucherNumber);
      } else if (
        reward.voucherNumber !== undefined &&
        reward.voucherNumber !== null
      ) {
        throw new Error(`Invalid voucher number on reward ${reward._id}`);
      }
      if (reward.voucherUid) {
        if (usedUids.has(reward.voucherUid)) {
          throw new Error(`Duplicate voucher UID ${reward.voucherUid}`);
        }
        usedUids.add(reward.voucherUid);
      }
      missing.push(reward);
    }
  } finally {
    await cursor.close();
  }

  let nextNumber = 1;
  const operations = [];
  let updateCount = 0;
  for (const reward of missing) {
    let voucherNumber = reward.voucherNumber;
    if (!voucherNumber && reward.voucherUid) {
      const parsed = reward.voucherUid.match(/-V(\d+)$/);
      if (parsed) {
        voucherNumber = Number(parsed[1]);
        if (usedNumbers.has(voucherNumber)) {
          throw new Error(
            `Voucher UID number ${voucherNumber} conflicts in batch ${batch._id}`,
          );
        }
        usedNumbers.add(voucherNumber);
      }
    }
    if (!voucherNumber) {
      while (usedNumbers.has(nextNumber)) nextNumber += 1;
      voucherNumber = nextNumber++;
      usedNumbers.add(voucherNumber);
    }
    const voucherUid =
      reward.voucherUid ||
      makeVoucherUid(productName, batch.batchNumber, voucherNumber);
    if (usedUids.has(voucherUid) && voucherUid !== reward.voucherUid) {
      throw new Error(
        `Voucher UID collision ${voucherUid} in batch ${batch._id}`,
      );
    }
    usedUids.add(voucherUid);
    if (
      reward.voucherNumber !== voucherNumber ||
      reward.voucherUid !== voucherUid
    ) {
      operations.push({
        updateOne: {
          filter: { _id: reward._id, batchId: batch._id },
          update: { $set: { voucherNumber, voucherUid } },
        },
      });
      updateCount += 1;
    }
    if (operations.length >= BATCH_SIZE && apply) {
      await Reward.bulkWrite(operations.splice(0, operations.length), {
        ordered: true,
      });
    }
  }
  if (apply && operations.length)
    await Reward.bulkWrite(operations, { ordered: true });
  return updateCount;
}

async function migrateRewardVoucherUids({ apply = false } = {}) {
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is required");
  const productKeys = await inspectProductNames();
  await inspectExistingVoucherUids();
  const unbatchedCount = await Reward.countDocuments({
    $or: [{ batchId: null }, { batchId: { $exists: false } }],
  });
  if (apply && unbatchedCount) {
    throw new Error(
      `${unbatchedCount} rewards have no batchId; run migrate:reward-batches before applying this migration.`,
    );
  }
  let rewardCount = 0;
  let batchCount = 0;
  let skippedEmptyBatchCount = 0;
  const batchCursor = RewardBatch.find({ productId: { $exists: true } })
    .select("_id productId batchNumber")
    .sort({ productId: 1, batchNumber: 1, _id: 1 })
    .lean()
    .cursor({ batchSize: BATCH_SIZE });
  const productNames = new Map(
    (await Product.find({}).select("_id name").lean()).map((product) => [
      String(product._id),
      product.name,
    ]),
  );

  try {
    for await (const batch of batchCursor) {
      const productName = productNames.get(String(batch.productId));
      if (!productName) {
        const skipped = await skipEmptyBatchOrThrow(
          batch,
          `Batch ${batch._id} references missing product ${batch.productId}. Restore the product or correct the batch productId before creating name-based voucher UIDs.`,
        );
        if (skipped) {
          skippedEmptyBatchCount += 1;
          continue;
        }
      }
      if (!Number.isInteger(batch.batchNumber) || batch.batchNumber < 1) {
        const skipped = await skipEmptyBatchOrThrow(
          batch,
          `Batch ${batch._id} has invalid batchNumber ${JSON.stringify(batch.batchNumber)}. Run migrate:reward-batches to backfill missing batch numbers; correct this batch manually if the value remains invalid.`,
        );
        if (skipped) {
          skippedEmptyBatchCount += 1;
          continue;
        }
      }
      rewardCount += await planBatchRewards(batch, productName, apply);
      batchCount += 1;
    }
  } finally {
    await batchCursor.close();
  }

  if (unbatchedCount) {
    console.warn(
      `${unbatchedCount} rewards have no batchId; run migrate:reward-batches first.`,
    );
  }

  if (apply) {
    await Product.bulkWrite(
      productKeys.map(({ _id, nameKey }) => ({
        updateOne: { filter: { _id }, update: { $set: { nameKey } } },
      })),
      { ordered: true },
    );
    await Product.collection.createIndex(
      { nameKey: 1 },
      { unique: true, sparse: true, name: "unique_product_filename_name" },
    );
    await Reward.collection.createIndex(
      { batchId: 1, voucherNumber: 1 },
      {
        unique: true,
        partialFilterExpression: { voucherNumber: { $type: "number" } },
        name: "unique_batch_voucher_number",
      },
    );
    await Reward.collection.createIndex(
      { voucherUid: 1 },
      {
        unique: true,
        partialFilterExpression: { voucherUid: { $type: "string" } },
        name: "unique_voucher_uid",
      },
    );
  }

  console.log(
    `${apply ? "Applied" : "Dry run:"} ${rewardCount} reward voucher identities across ${batchCount} batches; skipped ${skippedEmptyBatchCount} empty batches${unbatchedCount ? `; ${unbatchedCount} unbatched rewards need the batch migration` : ""}.`,
  );
  if (!apply)
    console.log(
      "No database changes made. Re-run with --apply to write the migration.",
    );
  return { rewardCount, batchCount, unbatchedCount };
}

if (require.main === module) {
  const apply = process.argv.includes("--apply");
  if (!process.env.MONGODB_URL) {
    console.error("MONGODB_URL is required to run this migration");
    process.exitCode = 1;
  } else {
    mongoose
      .connect(process.env.MONGODB_URL)
      .then(() => migrateRewardVoucherUids({ apply }))
      .catch((error) => {
        console.error("Reward voucher UID migration failed:", error);
        process.exitCode = 1;
      })
      .finally(async () => {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
      });
  }
}

module.exports = {
  migrateRewardVoucherUids,
  inspectProductNames,
  skipEmptyBatchOrThrow,
};

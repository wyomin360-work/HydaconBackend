require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const mongoose = require("mongoose");
const RewardBatch = require("../schemas/reward-batch.schema");
const Product = require("../schemas/product.schema");
const {
  generateRewardBatchUidToken,
  makeRewardBatchUidPrefix,
} = require("../utils/heplers");

const TOKEN_SPACE_SIZE = 32 ** 4;

async function updateRewardBatchUids({ apply = false } = {}) {
  const batches = await RewardBatch.find({})
    .select("_id productId batchNumber batchUid")
    .sort({ _id: 1 })
    .lean();
  if (!batches.length) {
    console.log("No reward batches found.");
    return { updated: 0 };
  }
  if (batches.length > TOKEN_SPACE_SIZE) {
    throw new Error(
      `Cannot assign unique 4-character tokens to ${batches.length} batches.`,
    );
  }

  const productIds = [
    ...new Set(batches.map((batch) => String(batch.productId))),
  ];
  const products = await Product.find({ _id: { $in: productIds } })
    .select("name")
    .lean();
  const productNames = new Map(
    products.map((product) => [String(product._id), product.name]),
  );
  const usedTokens = new Set();
  const existingUids = new Set(
    batches.map((batch) => batch.batchUid).filter(Boolean),
  );
  const updates = [];

  for (const batch of batches) {
    let token;
    let batchUid;
    do {
      token = generateRewardBatchUidToken();
      batchUid = `${makeRewardBatchUidPrefix(productNames.get(String(batch.productId)))}_${token}_${String(batch.batchNumber).padStart(2, "0")}`;
    } while (usedTokens.has(token) || existingUids.has(batchUid));

    usedTokens.add(token);
    updates.push({ batchId: batch._id, previousUid: batch.batchUid, batchUid });
  }

  console.log(
    `${apply ? "Applying" : "Dry run:"} would update ${updates.length} batch UIDs.`,
  );
  for (const { batchId, previousUid, batchUid } of updates.slice(0, 10)) {
    console.log(`${batchId}: ${previousUid || "<missing>"} -> ${batchUid}`);
  }
  if (updates.length > 10) console.log(`...and ${updates.length - 10} more.`);

  if (!apply) {
    console.log(
      "No database changes made. Re-run with --apply to write the updates.",
    );
    return { updated: 0, planned: updates.length };
  }

  let updated = 0;
  for (const { batchId, batchUid } of updates) {
    const result = await RewardBatch.updateOne(
      { _id: batchId },
      { $set: { batchUid } },
    );
    if (result.matchedCount !== 1) {
      throw new Error(
        `Batch ${batchId} disappeared during migration; ${updated} updates were applied.`,
      );
    }
    updated += 1;
  }
  console.log(`Updated ${updated} reward batch UIDs.`);
  return { updated };
}

if (require.main === module) {
  const apply = process.argv.includes("--apply");
  console.log(process.env.MONGODB_URL)
  if (!process.env.MONGODB_URL) {
    console.error("MONGODB_URL is required to run this migration");
    process.exitCode = 1;
  } else {
    mongoose
      .connect(process.env.MONGODB_URL)
      .then(() => updateRewardBatchUids({ apply }))
      .catch((error) => {
        console.error("Reward batch UID update failed:", error);
        process.exitCode = 1;
      })
      .finally(async () => {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
      });
  }
}

module.exports = { updateRewardBatchUids };

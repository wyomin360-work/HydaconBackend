require("dotenv").config();
const mongoose = require("mongoose");
const Redeem = require("./src/schemas/redeem.schema");
const Gift = require("./src/schemas/gift.schema");

async function run() {
  await mongoose.connect(process.env.MONGODB_URL);
  console.log("Connected to DB.");

  // 1. Mark all Redeems as claimed
  const redeemResult = await Redeem.updateMany(
    { scratchCardRewardType: "GIFT", scratchCardGiftClaimed: false },
    { $set: { scratchCardGiftClaimed: true } },
  );
  console.log(
    `Updated ${redeemResult.modifiedCount} Redeem records to scratchCardGiftClaimed = true`,
  );

  // 2. Clear rewardedUsers from all Gifts and reset reservedQuantity
  const gifts = await Gift.find({ "rewardedUsers.0": { $exists: true } });
  let totalCleared = 0;
  for (const gift of gifts) {
    const numToClear = gift.rewardedUsers.length;
    gift.rewardedUsers = [];
    gift.reservedQuantity = Math.max(0, gift.reservedQuantity - numToClear);
    await gift.save();
    totalCleared += numToClear;
    console.log(
      `Cleared ${numToClear} pending rewards from Gift: ${gift.name}`,
    );
  }
  console.log(
    `Total pending reward entries cleared from Gifts: ${totalCleared}`,
  );

  console.log("Done.");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

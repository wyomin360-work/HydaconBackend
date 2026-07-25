require("dotenv").config();
const mongoose = require("mongoose");
const ScratchCard = require("./src/schemas/scratch-card.schema");
const Redeem = require("./src/schemas/redeem.schema");
const Gift = require("./src/schemas/gift.schema");

async function run() {
  await mongoose.connect(process.env.MONGODB_URL);
  
  const cards = await ScratchCard.find({ rewardType: "GIFT", userId: "6a0fddac6b304d5ac015b2dc" })
    .populate("redeemId")
    .populate("giftId")
    .lean();

  console.log("Total GIFT cards for user:", cards.length);
  for (const card of cards) {
    console.log(`ScratchCard: ${card._id}, Gift: ${card.giftId?.name}`);
    if (card.redeemId) {
      console.log(`  Redeem: ${card.redeemId._id}`);
      console.log(`  Redeem Type: ${card.redeemId.scratchCardRewardType}`);
      console.log(`  Redeem Claimed: ${card.redeemId.scratchCardGiftClaimed}`);
    } else {
      console.log(`  Redeem: null`);
    }
  }

  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});

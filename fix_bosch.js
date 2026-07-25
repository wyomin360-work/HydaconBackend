require("dotenv").config();
const mongoose = require("mongoose");
const ScratchCard = require("./src/schemas/scratch-card.schema");
const Redeem = require("./src/schemas/redeem.schema");

async function run() {
  await mongoose.connect(process.env.MONGODB_URL);
  
  // Find all ScratchCards that say GIFT but their Redeem says POINTS
  const cards = await ScratchCard.find({ rewardType: "GIFT" }).populate("redeemId");
  
  let fixed = 0;
  for (const card of cards) {
    if (card.redeemId && card.redeemId.scratchCardRewardType === "POINTS") {
      // It's out of sync! Mark it as claimed so it disappears from Unclaimed.
      await Redeem.findByIdAndUpdate(card.redeemId._id, { scratchCardGiftClaimed: true });
      fixed++;
    }
  }

  console.log(`Fixed ${fixed} mismatched ScratchCard/Redeem records.`);
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});

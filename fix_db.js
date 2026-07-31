require("dotenv").config();
const mongoose = require("mongoose");
const Redeem = require("./src/schemas/redeem.schema");

async function run() {
  await mongoose.connect(process.env.MONGODB_URL);

  const result = await Redeem.updateMany(
    { scratchCardRewardType: "GIFT", scratchCardGiftClaimed: { $ne: true } },
    { $set: { scratchCardGiftClaimed: true } },
  );
  console.log(
    `Updated ${result.modifiedCount} Redeem records to scratchCardGiftClaimed = true`,
  );

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

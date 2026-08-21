const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const GiftRedemption = require("../src/schemas/gift-redemption.schema");
const MONGODB_URL =
  process.env.MONGODB_URL ||
  "mongodb+srv://josejobiin_db_user:Te3oFj5RbKvMCvl0@hydacon.tlgu5hs.mongodb.net/";

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URL);
  console.log("✅ Connected!");

  const userId = "6a29cb1be4905d529fac28e6";
  const giftId = "6a32f56c7586481a0fe641cb"; // spanner

  console.log(
    "\nAttempting to insert a duplicate redemption directly into DB...",
  );
  try {
    const duplicateRedemption = new GiftRedemption({
      userId,
      giftId,
      coinsUsed: 10,
      shippingAddress: {
        addressLine1: "Test St",
        city: "Test City",
        state: "Test State",
        pincode: "123456",
      },
    });

    await duplicateRedemption.save();
    console.log(
      "✅ Successfully inserted duplicate redemption! (No unique constraint exists on userId + giftId)",
    );

    // Clean it up
    await GiftRedemption.findByIdAndDelete(duplicateRedemption._id);
    console.log("Deleted the temporary test redemption.");
  } catch (error) {
    console.error("❌ Insertion failed!");
    if (error.code === 11000) {
      console.error(
        "\n[CONFIRMED] MongoDB has a UNIQUE index constraint on (userId, giftId) or (giftId)!",
      );
      console.error(JSON.stringify(error.keyValue, null, 2));
    } else {
      console.error(error);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

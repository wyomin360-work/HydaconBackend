require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const mongoose = require("mongoose");
const User = require("../schemas/user.schema");
const Tier = require("../schemas/tier.schema");
const UserTierProgress = require("../schemas/user-tier-progress.schema");
const LoyaltyTransaction = require("../schemas/loyalty-transaction.schema");

const TARGET_EMAIL = "jose.jobiin@gmail.com";

async function resetUserFull() {
  await mongoose.connect(process.env.MONGODB_URL);
  console.log("✅ Connected to MongoDB");

  const user = await User.findOne({ email: TARGET_EMAIL });
  if (!user) {
    console.error(`❌ No user found with email: ${TARGET_EMAIL}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`👤 Found user: ${user.name || "(no name)"} (${user._id})`);

  // Find base tier (rank 0 or lowest rank tier)
  const baseTier = await Tier.findOne().sort({ rank: 1 });
  if (baseTier) {
    console.log(
      `🏷️  Found base tier: ${baseTier.name} (rank: ${baseTier.rank}, ID: ${baseTier._id})`,
    );
  } else {
    console.log("⚠️  No tiers found in DB!");
  }

  const baseTierId = baseTier ? baseTier._id : null;

  // Reset User document
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        totalPoints: 0,
        lifetimePoints: 0,
        hydaconCoins: 0,
        lifetimeHydaconCoins: 0,
        currentTierId: baseTierId,
      },
    },
  );
  console.log(
    `✅ User points, coins reset to 0, and currentTierId set to ${baseTier ? baseTier.name : "null"}`,
  );

  // Delete/Reset UserTierProgress
  const userTierProgresses = await UserTierProgress.find({ userId: user._id });
  console.log(
    `📊 Found ${userTierProgresses.length} UserTierProgress record(s)`,
  );

  if (baseTierId) {
    await UserTierProgress.updateMany(
      { userId: user._id },
      {
        $set: {
          currentPoint: 0,
          currentTierId: baseTierId,
          previousTierId: null,
          lastCelebratedTierId: baseTierId,
          lastEvaluatedAt: new Date(),
        },
      },
    );
    console.log(
      "✅ Reset UserTierProgress records to base tier & 0 currentPoints",
    );
  } else {
    await UserTierProgress.deleteMany({ userId: user._id });
    console.log("🗑️  Deleted UserTierProgress records");
  }

  // Delete all loyalty transactions for this user
  const ltResult = await LoyaltyTransaction.deleteMany({ userId: user._id });
  console.log(`🗑️  Deleted ${ltResult.deletedCount} loyalty transaction(s)`);

  await mongoose.disconnect();
  console.log("🔌 Disconnected. Done.");
}

resetUserFull().catch((err) => {
  console.error("❌ Script failed:", err.message);
  process.exit(1);
});

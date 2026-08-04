require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const mongoose = require("mongoose");
const User = require("../schemas/user.schema");
const UserTierProgress = require("../schemas/user-tier-progress.schema");
const Tier = require("../schemas/tier.schema");

const TARGET_EMAIL = "jose.jobiin@gmail.com";

async function verifyUser() {
  await mongoose.connect(process.env.MONGODB_URL);
  const user = await User.findOne({ email: TARGET_EMAIL }).populate("currentTierId");
  console.log("User doc state:", {
    email: user.email,
    totalPoints: user.totalPoints,
    lifetimePoints: user.lifetimePoints,
    hydaconCoins: user.hydaconCoins,
    lifetimeHydaconCoins: user.lifetimeHydaconCoins,
    currentTier: user.currentTierId ? user.currentTierId.name : null,
  });

  const progress = await UserTierProgress.find({ userId: user._id }).populate("currentTierId");
  console.log("UserTierProgress docs:", progress.map(p => ({
    seasonId: p.seasonId,
    currentPoint: p.currentPoint,
    currentTier: p.currentTierId ? p.currentTierId.name : null,
  })));

  await mongoose.disconnect();
}

verifyUser().catch(console.error);

const mongoose = require("mongoose");
require("dotenv").config({ path: "./.env" });

const MONGODB_URL = process.env.MONGODB_URL || "mongodb+srv://hydaconcom_db_user:S42xKUTly8GuA33y@cluster0.xb0jt4a.mongodb.net/?appName=Cluster0";

const UserSchema = require("./src/schemas/user.schema");
const RoleSchema = require("./src/schemas/role.schema");
const ProgressSchema = require("./src/schemas/user-tier-progress.schema");
const SeasonSchema = require("./src/schemas/loyalty-season.schema");
const TierSchema = require("./src/schemas/tier.schema");

async function run() {
  await mongoose.connect(MONGODB_URL);
  const User = mongoose.model("User");
  const UserTierProgress = mongoose.model("UserTierProgress");

  const u = await User.findById("6a0ca8341e21fd8cb5d1f2c1").populate("roleId");
  console.log("\n--- USER DETAIL ---");
  console.log(JSON.stringify(u, null, 2));

  const p = await UserTierProgress.findOne({ userId: "6a0ca8341e21fd8cb5d1f2c1" }).populate("currentTierId");
  console.log("\n--- USER PROGRESS ---");
  console.log(JSON.stringify(p, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);

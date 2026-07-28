const mongoose = require("mongoose");
require("dotenv").config({ path: "./.env" });

const MONGODB_URL =
  process.env.MONGODB_URL ||
  "mongodb+srv://hydaconcom_db_user:S42xKUTly8GuA33y@cluster0.xb0jt4a.mongodb.net/?appName=Cluster0";

const UserTierProgressSchema = require("./src/schemas/user-tier-progress.schema");
const LoyaltySeasonSchema = require("./src/schemas/loyalty-season.schema");

async function run() {
  await mongoose.connect(MONGODB_URL);
  const UserTierProgress = mongoose.model("UserTierProgress");
  const LoyaltySeason = mongoose.model("LoyaltySeason");

  const activeSeason = await LoyaltySeason.findOne({ active: true });
  console.log(`Active Season: ${activeSeason._id} (${activeSeason.name})`);

  const progress = await UserTierProgress.find({
    userId: "6a0ca8341e21fd8cb5d1f2c1",
  }).populate("currentTierId");
  console.log("\n--- PROGRESS FOR JOBIN JOSE (CONTRACTOR) ---");
  progress.forEach((p) => {
    console.log(`Season: ${p.seasonId}`);
    console.log(`Tier ID: ${p.currentTierId ? p.currentTierId._id : "None"}`);
    console.log(
      `Tier Name: ${p.currentTierId ? p.currentTierId.name : "None"}`,
    );
    console.log(`Points: ${p.currentPoint}`);
    console.log("-------------------------\n");
  });

  await mongoose.disconnect();
}

run().catch(console.error);

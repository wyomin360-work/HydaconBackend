const mongoose = require("mongoose");
require("dotenv").config({ path: "./.env" });

const MONGODB_URL = process.env.MONGODB_URL || "mongodb+srv://hydaconcom_db_user:S42xKUTly8GuA33y@cluster0.xb0jt4a.mongodb.net/?appName=Cluster0";

const TierSchema = require("./src/schemas/tier.schema");

async function run() {
  await mongoose.connect(MONGODB_URL);
  const Tier = mongoose.model("Tier");

  const tiers = await Tier.find({});
  console.log("\n--- TIERS IN DATABASE ---");
  tiers.forEach(t => {
    console.log(`ID: ${t._id}`);
    console.log(`Name: ${t.name}`);
    console.log(`Rank: ${t.rank}`);
    console.log(`Min Points: ${t.qualificationThreshold}`);
    console.log("-------------------------\n");
  });

  await mongoose.disconnect();
}

run().catch(console.error);

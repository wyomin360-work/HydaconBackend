const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const MONGODB_URL =
  process.env.MONGODB_URL ||
  "mongodb+srv://josejobiin_db_user:Te3oFj5RbKvMCvl0@hydacon.tlgu5hs.mongodb.net/";

async function run() {
  console.log("Connecting to MongoDB at:", MONGODB_URL);
  await mongoose.connect(MONGODB_URL);
  console.log("✅ Connected successfully!");

  const db = mongoose.connection.db;
  const collectionName = "giftredemptions";

  console.log(`\nFetching indexes for collection '${collectionName}'...`);
  const indexes = await db.collection(collectionName).indexes();
  console.log(JSON.stringify(indexes, null, 2));

  console.log(`\nFetching total document count in '${collectionName}'...`);
  const count = await db.collection(collectionName).countDocuments({});
  console.log(`Total redemptions in DB: ${count}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Error running script:", err);
  process.exit(1);
});

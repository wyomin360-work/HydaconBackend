const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const MONGODB_URL =
  process.env.MONGODB_URL ||
  "mongodb+srv://josejobiin_db_user:Te3oFj5RbKvMCvl0@hydacon.tlgu5hs.mongodb.net/";

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URL);
  console.log("✅ Connected!");

  const db = mongoose.connection.db;
  const collectionName = "giftredemptions";

  console.log(`\nFetching indexes for collection '${collectionName}'...`);
  const indexes = await db.collection(collectionName).indexes();
  console.log(JSON.stringify(indexes, null, 2));

  for (const index of indexes) {
    // We want to drop unique indexes on giftId, or userId, except the default _id index
    if (index.name !== "_id_" && index.unique) {
      console.log(`\nFound unique index to drop: ${index.name}`);
      try {
        await db.collection(collectionName).dropIndex(index.name);
        console.log(`✅ Successfully dropped index: ${index.name}`);
      } catch (err) {
        console.error(`❌ Failed to drop index ${index.name}:`, err.message);
      }
    }
  }

  await mongoose.disconnect();
  console.log(
    "\nDone! Please restart your server and try making a claim again.",
  );
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});

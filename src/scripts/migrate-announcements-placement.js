require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const mongoose = require("mongoose");
const Content = require("../schemas/content.schema");

async function migrateAnnouncements() {
  const MONGODB_URL =
    process.env.MONGODB_URL ||
    "mongodb+srv://josejobiin_db_user:ce0HFaSM7mecATMz@hydacon.tlgu5hs.mongodb.net/";

  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URL);
  console.log("✅ Connected to MongoDB");

  const contents = await Content.find({
    placements: "HOME_ANNOUNCEMENT_FEED",
  });

  console.log(`Found ${contents.length} contents with HOME_ANNOUNCEMENT_FEED.`);

  for (const doc of contents) {
    const updatedPlacements = doc.placements.map((p) =>
      p === "HOME_ANNOUNCEMENT_FEED" ? "ANNOUNCEMENTS" : p,
    );
    // Remove duplicates
    doc.placements = Array.from(new Set(updatedPlacements));
    await doc.save();
    console.log(
      `Updated content "${doc.title}" (${doc._id}) placements to:`,
      doc.placements,
    );
  }

  await mongoose.disconnect();
  console.log("🔌 Migration completed successfully.");
}

migrateAnnouncements().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
});

const mongoose = require("mongoose");
require("dotenv").config({ path: "./env/.env.development" });
const Database = require("./src/config/mongodb.config");
const Content = require("./src/schemas/content.schema");

const db = new Database();

async function check() {
  try {
    await db.connectDb();
    console.log("Connected to DB!");
    const items = await Content.find({}).lean();
    console.log("Found", items.length, "content items:");
    items.forEach(item => {
      console.log(`- Title: "${item.title}" | Type: ${item.type} | PopupType: ${item.popupType} | Placements: [${item.placements.join(", ")}]`);
      console.log("  Images:", JSON.stringify(item.images, null, 2));
    });
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

check();

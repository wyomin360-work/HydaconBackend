const mongoose = require("mongoose");
require("dotenv").config({ path: "./.env" });

const MONGODB_URL =
  process.env.MONGODB_URL ||
  "mongodb+srv://hydaconcom_db_user:S42xKUTly8GuA33y@cluster0.xb0jt4a.mongodb.net/?appName=Cluster0";

const UserSchema = require("./src/schemas/user.schema");
const RoleSchema = require("./src/schemas/role.schema");
const RuleSetSchema = require("./src/schemas/rule-set.schema");
const ContentSchema = require("./src/schemas/content.schema");
const contentService = require("./src/modules/content/content.service");

async function run() {
  await mongoose.connect(MONGODB_URL);
  const User = mongoose.model("User");

  // Get 5 most recently updated users
  const recentUsers = await User.find({})
    .sort({ updatedAt: -1 })
    .limit(5)
    .populate("roleId");
  console.log("\n--- RECENTLY ACTIVE USERS ---");
  for (const u of recentUsers) {
    console.log(`ID: ${u._id}`);
    console.log(`Name: ${u.name || u.fullName || u.username}`);
    console.log(`Email: ${u.email}`);
    console.log(`Role: ${u.roleId ? u.roleId.name : "None"}`);
    console.log(`Tier: ${u.currentTierId || "None"}`);
    console.log(`Updated: ${u.updatedAt}`);

    // Evaluate rules for this user
    console.log("Homepage content popups returned:");
    const content = await contentService.getHomepageContent(u._id);
    let foundAny = false;
    Object.keys(content).forEach((placement) => {
      content[placement].forEach((item) => {
        if (item.type === "POPUP") {
          foundAny = true;
          console.log(
            `  - [${placement}] "${item.title}" (popupType: ${item.popupType}, rule: ${item.ruleSetId ? item.ruleSetId.name || item.ruleSetId : "None"})`,
          );
        }
      });
    });
    if (!foundAny) console.log("  (None)");
    console.log("-----------------------------\n");
  }

  await mongoose.disconnect();
}

run().catch(console.error);

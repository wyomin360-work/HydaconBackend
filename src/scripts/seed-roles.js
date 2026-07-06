require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const mongoose = require("mongoose");
const Role = require("../schemas/role.schema");

const ROLES_TO_SEED = [
  {
    name: "Mason",
    description: "Skilled masonry worker who applies Hydacon products on-site",
    isActive: true,
    pointMultiplier: 10,
    permissions: [],
  },
  {
    name: "Contractor",
    description: "Construction contractor who oversees and purchases Hydacon products",
    isActive: true,
    pointMultiplier: 5,
    permissions: [],
  },
];

async function seedRoles() {
  const MONGODB_URL = "mongodb+srv://josejobiin_db_user:ce0HFaSM7mecATMz@hydacon.tlgu5hs.mongodb.net/";
  await mongoose.connect(MONGODB_URL);
  console.log("✅ Connected to MongoDB");

  for (const roleData of ROLES_TO_SEED) {
    const existing = await Role.findOne({ name: roleData.name });
    if (existing) {
      console.log(`⏭️  Skipped "${roleData.name}" — already exists`);
    } else {
      await Role.create(roleData);
      console.log(`✅ Created role: "${roleData.name}"`);
    }
  }

  await mongoose.disconnect();
  console.log("🔌 Disconnected. Done.");
}

seedRoles().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});

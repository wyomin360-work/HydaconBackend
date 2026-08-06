require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const mongoose = require("mongoose");
const User = require("../schemas/user.schema");
const UserBankAccount = require("../schemas/user-bank-account.schema");
const Withdrawal = require("../schemas/withdrawal.schema");
const { encrypt } = require("../utils/encryption");

const TARGET_EMAIL = "jose.jobiin@gmail.com";

async function run() {
  await mongoose.connect(process.env.MONGODB_URL);
  console.log("✅ Connected to MongoDB");

  let user = await User.findOne({ email: TARGET_EMAIL });
  if (!user) {
    console.log(`👤 User with email ${TARGET_EMAIL} not found, searching for any user...`);
    user = await User.findOne();
  }

  if (!user) {
    console.error("❌ No users found in database. Please register a user first.");
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`👤 Using user: ${user.name} (${user.email}) - ID: ${user._id}`);

  // Give user 500 coins for testing
  user.hydaconCoins = 500;
  await user.save();
  console.log("🪙 Set user hydaconCoins to 500");

  // Deactivate existing bank accounts
  await UserBankAccount.updateMany({ userId: user._id }, { isActive: false });

  // Encrypt details
  const accountNumber = "1234567890";
  const ifscCode = "HDFC0000053";
  const encryptedAccountNumber = encrypt(accountNumber);
  const encryptedIfscCode = encrypt(ifscCode);

  const bankAccount = await UserBankAccount.create({
    userId: user._id,
    accountHolderName: user.name || "Test User",
    accountNumber: encryptedAccountNumber.encryptedData,
    accountIv: encryptedAccountNumber.iv,
    ifscCode: encryptedIfscCode.encryptedData,
    ifscIv: encryptedIfscCode.iv,
    bankName: "HDFC Bank",
    branchName: "MUMBAI SANDOZ HOUSE",
    isActive: true,
  });
  console.log(`🏦 Created active UserBankAccount record ID: ${bankAccount._id}`);

  // Create PENDING withdrawal
  const withdrawal = await Withdrawal.create({
    userId: user._id,
    coinAmount: 100,
    cashAmount: 200,
    bankAccountId: bankAccount._id,
    status: "PENDING",
    remarks: "Initial test withdrawal request",
  });
  console.log(`💸 Created PENDING Withdrawal request ID: ${withdrawal._id} for ₹200`);

  await mongoose.disconnect();
  console.log("🔌 Database disconnected. Seed complete.");
}

run().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});

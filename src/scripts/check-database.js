require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const mongoose = require("mongoose");
const Admin = require("../schemas/admin.schema");
const User = require("../schemas/user.schema");
const Withdrawal = require("../schemas/withdrawal.schema");
const jwt = require("jsonwebtoken");

async function check() {
  await mongoose.connect(process.env.MONGODB_URL);
  console.log("Connected to MongoDB");

  const admins = await Admin.find({});
  console.log(`Found ${admins.length} Admins:`);
  admins.forEach((a) =>
    console.log(`- ID: ${a._id}, Email: ${a.email}, Role: ${a.role}`),
  );

  const users = await User.find({});
  console.log(`Found ${users.length} Users`);

  const withdrawals = await Withdrawal.find({});
  console.log(`Found ${withdrawals.length} Withdrawals`);

  if (admins.length > 0) {
    const admin = admins[0];
    const token = jwt.sign(
      { adminId: admin._id, email: admin.email, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );
    console.log(`Generated Admin Token for ${admin.email}:`);
    console.log(`Bearer ${token}`);
  }

  await mongoose.disconnect();
}

check().catch(console.error);

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./src/schemas/user.schema");
const Redeem = require("./src/schemas/redeem.schema");

mongoose
  .connect(process.env.MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("Connected to MongoDB");
    const users = await User.find({});
    for (const user of users) {
      const scanCount = await Redeem.countDocuments({
        userId: user._id,
        status: "SUCCESS",
      });
      if (user.totalScans !== scanCount) {
        user.totalScans = scanCount;
        await user.save();
        console.log(`Updated user ${user.email} with ${scanCount} scans.`);
      }
    }
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

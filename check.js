const mongoose = require("mongoose");
const User = require("./src/schemas/user.schema");
require("dotenv").config();

mongoose
  .connect(process.env.MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    const user = await User.findById("6968705505595e474928a310");
    console.log("totalScans in DB:", user.totalScans);
    process.exit(0);
  });

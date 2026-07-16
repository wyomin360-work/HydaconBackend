const mongoose = require("mongoose");
const Product = require("./src/schemas/product.schema");
require("dotenv").config();

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    const product = await Product.findById("tilebond-eco").lean();
    console.log("Product found:", product ? product.name : "null");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    mongoose.disconnect();
  }
}
test();

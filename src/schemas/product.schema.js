const { default: mongoose } = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    netWeight: { type: String, required: true },
    price: { type: Number, required: false },
    image: { type: String, required: false },
    rewardPoints: { type: Number, required: true, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const Product = mongoose.model("Product", productSchema);
module.exports = Product;

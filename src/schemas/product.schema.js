const { default: mongoose } = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    weightValue: { type: Number, required: true },
    weightUnit: { type: String, required: true, enum: ["kg", "g", "l", "ml"] },
    tdsDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: false,
    },
    price: { type: Number, required: false },
    images: { type: [String], required: false, default: [] },
    featuredImage: { type: String, required: false },
    rewardPoints: { type: Number, required: true, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const Product = mongoose.model("Product", productSchema);
module.exports = Product;

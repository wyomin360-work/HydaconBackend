const { default: mongoose } = require("mongoose");

const giftCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const GiftCategory = mongoose.model("GiftCategory", giftCategorySchema);
module.exports = GiftCategory;

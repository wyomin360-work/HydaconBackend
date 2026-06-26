const { default: mongoose } = require("mongoose");

const rewardRulesSchema = new mongoose.Schema(
  {
    minTierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tier",
      required: false,
    },
    minScansThisMonth: { type: Number, default: 0 },
    regionRestrictions: [{ type: String }],
  },
  { _id: false }
);

const giftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GiftCategory",
      required: true,
    },
    priceInCoins: { type: Number, required: true },
    stockQuantity: { type: Number, required: true, default: 0 },
    reservedQuantity: { type: Number, required: true, default: 0 },
    image: { type: String },
    active: { type: Boolean, default: true },
    rewardRules: {
      type: rewardRulesSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

const Gift = mongoose.model("Gift", giftSchema);
module.exports = Gift;

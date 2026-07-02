const { default: mongoose } = require("mongoose");

const giftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    giftType: {
      type: String,
      enum: ["physical", "voucher"],
      required: true,
      default: "physical",
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GiftCategory",
      required: function () {
        return this.giftType === "physical";
      },
    },
    priceInCoins: { type: Number, required: true },
    stockQuantity: { type: Number, required: true, default: 0 },
    reservedQuantity: { type: Number, required: true, default: 0 },
    image: { type: String },
    active: { type: Boolean, default: true },
    ruleSetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RuleSet",
      required: false,
    },
  },
  { timestamps: true },
);

const Gift = mongoose.model("Gift", giftSchema);
module.exports = Gift;

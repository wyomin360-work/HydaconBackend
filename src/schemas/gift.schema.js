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
    // --- Voucher-specific fields ---
    voucherRedemptionType: {
      type: String,
      enum: ["code", "file"],
      required: function () {
        return this.giftType === "voucher";
      },
    },
    voucherCode: {
      type: String,
      required: function () {
        return (
          this.giftType === "voucher" && this.voucherRedemptionType === "code"
        );
      },
    },
    voucherFileUrl: {
      type: String,
      required: function () {
        return (
          this.giftType === "voucher" && this.voucherRedemptionType === "file"
        );
      },
    },
  },
  { timestamps: true },
);

const Gift = mongoose.model("Gift", giftSchema);
module.exports = Gift;

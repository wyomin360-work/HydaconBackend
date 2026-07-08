const { default: mongoose } = require("mongoose");
const { GIFT_REDEMPTION_STATUS } = require("../constants/gift");

const shippingAddressSchema = new mongoose.Schema(
  {
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
  },
  { _id: false },
);

const giftRedemptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    giftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gift",
      required: true,
    },
    coinsUsed: { type: Number, required: true },
    giftType: {
      type: String,
      enum: ["physical", "voucher"],
      required: true,
      default: "physical",
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(GIFT_REDEMPTION_STATUS),
      default: GIFT_REDEMPTION_STATUS.PROCESSING,
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: function () {
        return this.giftType === "physical";
      },
    },
    trackingNumber: { type: String },
    courierDetails: { type: String },
    cancellationReason: { type: String },
    // --- Voucher-specific fields (snapshot at time of redemption) ---
    voucherCode: { type: String },
    voucherFileUrl: { type: String },
    voucherSent: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const GiftRedemption = mongoose.model("GiftRedemption", giftRedemptionSchema);
module.exports = GiftRedemption;

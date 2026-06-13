const { default: mongoose } = require("mongoose");

const shippingAddressSchema = new mongoose.Schema(
  {
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
  },
  { _id: false }
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
    status: {
      type: String,
      required: true,
      enum: ["Processing", "Approved", "Packed", "Shipped", "Delivered", "Cancelled"],
      default: "Processing"
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: false,
    },
    trackingNumber: { type: String },
    courierDetails: { type: String },
    cancellationReason: { type: String },
  },
  { timestamps: true }
);

const GiftRedemption = mongoose.model("GiftRedemption", giftRedemptionSchema);
module.exports = GiftRedemption;

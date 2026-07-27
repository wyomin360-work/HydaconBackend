const { default: mongoose } = require("mongoose");
const { REDEEM_STATUS } = require("../constants/redeem");

const locationSchema = new mongoose.Schema(
  {
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true },
  },
  { _id: false },
);

const redeemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rewardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reward",
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    rewardPoints: { type: Number, required: true },
    rewardUidCode: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(REDEEM_STATUS),
    },
    location: {
      type: locationSchema,
      required: true,
    },

    cardBg: { type: String },
    scannerRole: { type: String },
    scannerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    scratchCardRewardType: {
      type: String,
      enum: ["POINTS", "GIFT", "NONE"],
      default: "NONE",
    },
    scratchCardBonusPoints: { type: Number, default: 0 },
    scratchCardGiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gift",
    },
    scratchCardGiftClaimed: { type: Boolean, default: false },
    scratchCardGiftRedemptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GiftRedemption",
    },
    scratchCardCampaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ScratchCardRule",
    },
  },
  { timestamps: true },
);

redeemSchema.set("toJSON", { virtuals: true });
redeemSchema.set("toObject", { virtuals: true });

redeemSchema.virtual("reward", {
  ref: "Reward",
  localField: "rewardId",
  foreignField: "_id",
  justOne: true,
});

redeemSchema.virtual("product", {
  ref: "Product",
  localField: "productId",
  foreignField: "_id",
  justOne: true,
});

redeemSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

redeemSchema.virtual("scratchCardGift", {
  ref: "Gift",
  localField: "scratchCardGiftId",
  foreignField: "_id",
  justOne: true,
});

redeemSchema.virtual("scratchCardGiftRedemption", {
  ref: "GiftRedemption",
  localField: "scratchCardGiftRedemptionId",
  foreignField: "_id",
  justOne: true,
});

const Redeem = mongoose.model("Redeem", redeemSchema);

module.exports = Redeem;

const mongoose = require("mongoose");

const scratchCardSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "ScratchCardCampaign", required: true },
    redeemId: { type: mongoose.Schema.Types.ObjectId, ref: "Redeem", required: true },
    status: {
      type: String,
      enum: ["UNREVEALED", "REVEALED", "EXPIRED"],
      default: "UNREVEALED",
    },
    rewardType: {
      type: String,
      enum: ["POINTS", "GIFT", "NONE"],
      default: "NONE",
    },
    pointsAmount: { type: Number, default: 0 },
    giftId: { type: mongoose.Schema.Types.ObjectId, ref: "Gift", default: null },
    giftRedemptionId: { type: mongoose.Schema.Types.ObjectId, ref: "GiftRedemption", default: null },
    expiresAt: { type: Date, default: null },
    revealedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (doc, ret) => {
        ret.id = doc._id;
        return ret;
      },
    },
  }
);

const ScratchCard = mongoose.model("ScratchCard", scratchCardSchema);
module.exports = ScratchCard;

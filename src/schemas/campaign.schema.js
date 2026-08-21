const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    type: {
      type: String,
      enum: ["SEASONAL", "EXCLUSIVE_OFFER", "CASHBACK", "VIP"],
      default: "EXCLUSIVE_OFFER",
    },
    visibilityTiers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tier" }],
    eligibilityTiers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tier" }],
    rewardBonusPercentage: { type: Number, default: 0 },
    imageUrl: { type: String, default: "" },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
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
  },
);

const Campaign = mongoose.model("Campaign", campaignSchema);
module.exports = Campaign;

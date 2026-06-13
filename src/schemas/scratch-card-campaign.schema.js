const mongoose = require("mongoose");

const rewardPoolSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["POINTS", "GIFT"],
      required: true,
    },
    points: { type: Number, default: 0 },
    giftId: { type: mongoose.Schema.Types.ObjectId, ref: "Gift", default: null },
    probability: { type: Number, required: true }, // e.g. 10 for 10%
    totalQuantity: { type: Number, required: true, default: 0 }, // 0 means unlimited
    remainingQuantity: { type: Number, required: true, default: 0 },
  },
  { _id: true }
);

const scratchCardCampaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    eligibleProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    rewardPool: [rewardPoolSchema],
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
  }
);

const ScratchCardCampaign = mongoose.model("ScratchCardCampaign", scratchCardCampaignSchema);
module.exports = ScratchCardCampaign;

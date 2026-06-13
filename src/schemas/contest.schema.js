const mongoose = require("mongoose");

const prizeSchema = new mongoose.Schema(
  {
    rankStart: { type: Number, required: true },
    rankEnd: { type: Number, required: true },
    rewardType: {
      type: String,
      enum: ["POINTS", "GIFT"],
      required: true,
    },
    points: { type: Number, default: 0 },
    giftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gift",
      default: null,
    },
  },
  { _id: true }
);

const winnerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rank: { type: Number, required: true },
    rewardType: { type: String, enum: ["POINTS", "GIFT", "NONE"], required: true },
    pointsAmount: { type: Number, default: 0 },
    giftId: { type: mongoose.Schema.Types.ObjectId, ref: "Gift", default: null },
    giftRedemptionId: { type: mongoose.Schema.Types.ObjectId, ref: "GiftRedemption", default: null },
  },
  { _id: false }
);

const contestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    region: { type: String, required: true, default: "ALL" }, // matches User's areaOfOperation, "ALL" for global
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    prizeStructure: { type: [prizeSchema], default: [] },
    isActive: { type: Boolean, default: true },
    winnersFinalized: { type: Boolean, default: false },
    winners: { type: [winnerSchema], default: [] },
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

const Contest = mongoose.model("Contest", contestSchema);

module.exports = Contest;

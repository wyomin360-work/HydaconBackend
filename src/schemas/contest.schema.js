const mongoose = require("mongoose");
const {
  CONTEST_STATUS,
  REWARD_TYPE,
  PRODUCT_SCOPE,
  TIER_SCOPE,
} = require("../constants/contests");

const prizeSchema = new mongoose.Schema(
  {
    rank: { type: Number, required: true }, // 1 = first place
    rewardType: {
      type: String,
      enum: Object.values(REWARD_TYPE),
      required: true,
    },
    // For bonus-point prizes
    points: { type: Number, default: 0 },
    // For physical-gift prizes
    giftId: { type: mongoose.Schema.Types.ObjectId, ref: "Gift" },
    giftName: { type: String },
  },
  { _id: false },
);

const contestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    bannerImage: { type: String },
    rewardSummary: { type: String },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    region: { type: String }, // null = global
    status: {
      type: String,
      enum: Object.values(CONTEST_STATUS),
      default: CONTEST_STATUS.UPCOMING,
    },
    ruleSetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RuleSet",
    },
    prizes: {
      type: [prizeSchema],
      default: () => [],
    },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    isFinalizedManually: { type: Boolean, default: false },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    finalizedAt: { type: Date },
    isCancelled: { type: Boolean, default: false },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    cancelledAt: { type: Date },
  },
  { timestamps: true },
);

// Auto-update status based on dates (excluding CANCELLED)
contestSchema.pre("find", function () {
  const now = new Date();
  this.model
    .updateMany(
      {
        startDate: { $gt: now },
        status: { $nin: [CONTEST_STATUS.UPCOMING, CONTEST_STATUS.CANCELLED] },
      },
      { $set: { status: CONTEST_STATUS.UPCOMING } },
    )
    .exec();
  this.model
    .updateMany(
      {
        startDate: { $lte: now },
        endDate: { $gte: now },
        status: {
          $nin: [
            CONTEST_STATUS.ONGOING,
            CONTEST_STATUS.CANCELLED,
            CONTEST_STATUS.COMPLETED,
          ],
        },
      },
      { $set: { status: CONTEST_STATUS.ONGOING } },
    )
    .exec();
  this.model
    .updateMany(
      {
        endDate: { $lt: now },
        status: { $nin: [CONTEST_STATUS.COMPLETED, CONTEST_STATUS.CANCELLED] },
      },
      { $set: { status: CONTEST_STATUS.COMPLETED } },
    )
    .exec();
});

const Contest = mongoose.model("Contest", contestSchema);
module.exports = { Contest, CONTEST_STATUS, REWARD_TYPE };

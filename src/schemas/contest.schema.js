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
    productScope: {
      type: String,
      enum: Object.values(PRODUCT_SCOPE),
      default: PRODUCT_SCOPE.EVERY_PRODUCT,
    },
    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    tierScope: {
      type: String,
      enum: Object.values(TIER_SCOPE),
      default: TIER_SCOPE.ALL_TIERS,
    },
    tiers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tier",
      },
    ],
    prizes: {
      type: [prizeSchema],
      default: () => [],
    },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

// Auto-update status based on dates
contestSchema.pre("find", function () {
  const now = new Date();
  this.model
    .updateMany(
      { startDate: { $gt: now }, status: { $ne: CONTEST_STATUS.UPCOMING } },
      { $set: { status: CONTEST_STATUS.UPCOMING } },
    )
    .exec();
  this.model
    .updateMany(
      {
        startDate: { $lte: now },
        endDate: { $gte: now },
        status: { $ne: CONTEST_STATUS.ACTIVE },
      },
      { $set: { status: CONTEST_STATUS.ACTIVE } },
    )
    .exec();
  this.model
    .updateMany(
      { endDate: { $lt: now }, status: { $ne: CONTEST_STATUS.COMPLETED } },
      { $set: { status: CONTEST_STATUS.COMPLETED } },
    )
    .exec();
});

const Contest = mongoose.model("Contest", contestSchema);
module.exports = { Contest, CONTEST_STATUS, REWARD_TYPE };

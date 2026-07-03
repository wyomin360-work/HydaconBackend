const { default: mongoose } = require("mongoose");

const CONTEST_STATUS = {
  UPCOMING: "upcoming",
  ACTIVE: "active",
  COMPLETED: "completed",
};

const REWARD_TYPE = {
  POINTS: "points",
  GIFT: "gift",
};

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
      enum: ["EVERY_PRODUCT", "SELECTED_PRODUCTS"],
      default: "EVERY_PRODUCT",
    },
    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    tierScope: {
      type: String,
      enum: ["ALL_TIERS", "SELECTED_TIERS"],
      default: "ALL_TIERS",
    },
    tiers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tier",
      },
    ],
    prizes: [prizeSchema],
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

// Auto-update status based on dates
contestSchema.pre("find", function () {
  const now = new Date();
  this.model.updateMany(
    { startDate: { $gt: now }, status: { $ne: CONTEST_STATUS.UPCOMING } },
    { $set: { status: CONTEST_STATUS.UPCOMING } }
  ).exec();
  this.model.updateMany(
    { startDate: { $lte: now }, endDate: { $gte: now }, status: { $ne: CONTEST_STATUS.ACTIVE } },
    { $set: { status: CONTEST_STATUS.ACTIVE } }
  ).exec();
  this.model.updateMany(
    { endDate: { $lt: now }, status: { $ne: CONTEST_STATUS.COMPLETED } },
    { $set: { status: CONTEST_STATUS.COMPLETED } }
  ).exec();
});

const Contest = mongoose.model("Contest", contestSchema);
module.exports = { Contest, CONTEST_STATUS, REWARD_TYPE };

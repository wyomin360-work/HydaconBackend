const mongoose = require("mongoose");
const { CARRY_FORWARD_BEHAVIOR } = require("../constants/loyalty");

const loyaltySeasonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true }, // e.g. "S1_2026", "SUMMER_26"
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    active: { type: Boolean, default: false }, // Only one season should be active at a time
    carryForwardBehavior: {
      type: String,
      enum: Object.values(CARRY_FORWARD_BEHAVIOR),
      default: CARRY_FORWARD_BEHAVIOR.RESET,
    },
    carryForwardPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    activatedAt: { type: Date, default: null },
    deactivatedAt: { type: Date, default: null },
    isArchived: { type: Boolean, default: false, index: true },
    bannerImages: { type: [String], default: [] },
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

loyaltySeasonSchema.index({ startDate: 1, endDate: 1 });
loyaltySeasonSchema.index(
  { active: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);

const LoyaltySeason = mongoose.model("LoyaltySeason", loyaltySeasonSchema);
module.exports = LoyaltySeason;

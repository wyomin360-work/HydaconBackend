const mongoose = require("mongoose");

const tierConfigurationHistorySchema = new mongoose.Schema(
  {
    tierConfigurationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TierConfiguration",
      required: true,
      index: true,
    },
    seasonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoyaltySeason",
      required: true,
      index: true,
    },
    tierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tier",
      required: true,
      index: true,
    },
    version: { type: Number, required: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    effectiveFrom: { type: Date, required: true, default: Date.now },
    effectiveTo: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

tierConfigurationHistorySchema.index(
  { tierConfigurationId: 1, version: -1 },
  { unique: true },
);
tierConfigurationHistorySchema.index({
  seasonId: 1,
  tierId: 1,
  effectiveFrom: -1,
});

const TierConfigurationHistory = mongoose.model(
  "TierConfigurationHistory",
  tierConfigurationHistorySchema,
  "TierConfigurationHistories",
);

module.exports = TierConfigurationHistory;

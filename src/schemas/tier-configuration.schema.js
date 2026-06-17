const mongoose = require("mongoose");

const tierConfigurationSchema = new mongoose.Schema(
  {
    tierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tier",
      required: true,
    },
    seasonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoyaltySeason",
      required: true,
    },
    qualificationPoint: { type: Number, default: 0 }, // QP required to enter this tier
    threshold: { type: Number, default: 0 },
    isFinalTier: { type: Boolean, default: false },
    pointMultiplier: { type: Number, default: 1.0 }, // Multiplier for scanning
    benefits: [{ type: mongoose.Schema.Types.ObjectId, ref: "TierBenefit" }],
    active: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    isArchived: { type: Boolean, default: false, index: true },
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

// Compound index to ensure one tier config per tier per season
tierConfigurationSchema.index(
  { tierId: 1, seasonId: 1 },
  { unique: true, partialFilterExpression: { isArchived: false } }
);

const TierConfiguration = mongoose.model(
  "TierConfiguration",
  tierConfigurationSchema,
);
module.exports = TierConfiguration;

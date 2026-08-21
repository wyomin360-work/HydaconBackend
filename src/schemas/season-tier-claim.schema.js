const mongoose = require("mongoose");

const seasonTierClaimSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
    tierConfigurationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TierConfiguration",
      required: true,
    },
    claimedAt: {
      type: Date,
      default: Date.now,
    },
    rewardsClaimed: {
      type: Array,
      default: [],
    },
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

seasonTierClaimSchema.index(
  { userId: 1, seasonId: 1, tierId: 1 },
  { unique: true },
);

const SeasonTierClaim = mongoose.model(
  "SeasonTierClaim",
  seasonTierClaimSchema,
);

module.exports = SeasonTierClaim;

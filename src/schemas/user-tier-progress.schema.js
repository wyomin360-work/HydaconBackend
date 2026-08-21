const mongoose = require("mongoose");

const userTierProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seasonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoyaltySeason",
      required: true,
    },
    currentTierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tier",
      required: true,
    },
    previousTierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tier",
      default: null,
    }, // Tier before last upgrade
    lastCelebratedTierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tier",
      default: null,
    }, // Last tier celebrated by user
    lastCelebratedSeasonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoyaltySeason",
      default: null,
    }, // Last season celebrated by user
    currentPoint: { type: Number, default: 0 }, // QP (strictly scan points)
    lastEvaluatedAt: { type: Date, default: Date.now },
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

// Compound index to ensure one progress entry per user per season
userTierProgressSchema.index({ userId: 1, seasonId: 1 }, { unique: true });

const UserTierProgress = mongoose.model(
  "UserTierProgress",
  userTierProgressSchema,
);
module.exports = UserTierProgress;

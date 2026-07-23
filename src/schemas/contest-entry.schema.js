const mongoose = require("mongoose");
const { ENTRY_REWARD_STATUS, REWARD_TYPE } = require("../constants/contests");

/**
 * Tracks each user's participation in a contest.
 * Points here are the user's qualificationPoints snapshot at the time of
 * leaderboard evaluation — NOT bonus points, so they never affect tier progression.
 */
const contestEntrySchema = new mongoose.Schema(
  {
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Snapshot of the user's qualification points at contest end
    qualificationPoints: { type: Number, default: 0 },
    // Calculated rank (1 = winner)
    rank: { type: Number },
    // Prize actually awarded
    rewardType: {
      type: String,
      enum: [...Object.values(REWARD_TYPE), null],
      default: null,
    },
    bonusPointsAwarded: { type: Number, default: 0 }, // bonus only — NOT tier points
    giftRedemptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GiftRedemption",
    },
    rewardStatus: {
      type: String,
      enum: Object.values(ENTRY_REWARD_STATUS),
      default: ENTRY_REWARD_STATUS.PENDING,
    },
  },
  { timestamps: true },
);

// Unique entry per user per contest
contestEntrySchema.index({ contestId: 1, userId: 1 }, { unique: true });

contestEntrySchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

contestEntrySchema.set("toJSON", { virtuals: true });
contestEntrySchema.set("toObject", { virtuals: true });

const ContestEntry = mongoose.model("ContestEntry", contestEntrySchema);
module.exports = { ContestEntry, ENTRY_REWARD_STATUS };

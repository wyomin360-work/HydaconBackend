const mongoose = require("mongoose");

const userTierProgressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: "LoyaltySeason", required: true },
    currentTierId: { type: mongoose.Schema.Types.ObjectId, ref: "Tier", required: true },
    previousTierId: { type: mongoose.Schema.Types.ObjectId, ref: "Tier", default: null }, // Tier before last upgrade
    lastCelebratedTierId: { type: mongoose.Schema.Types.ObjectId, ref: "Tier", default: null }, // Last tier celebrated by user
    qualificationPoints: { type: Number, default: 0 }, // QP (strictly scan points)
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
  }
);

// Compound index to ensure one progress entry per user per season
userTierProgressSchema.index({ userId: 1, seasonId: 1 }, { unique: true });

userTierProgressSchema.pre("save", async function (next) {
  try {
    const User = mongoose.model("User");
    const user = await User.findById(this.userId);
    if (user && this.qualificationPoints < user.totalPoints) {
      this.qualificationPoints = user.totalPoints;
    }
  } catch (err) {
    console.error("Error in UserTierProgress pre-save hook:", err);
  }
  next();
});

const UserTierProgress = mongoose.model("UserTierProgress", userTierProgressSchema);
module.exports = UserTierProgress;

const { default: mongoose } = require("mongoose");

const rewardSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Types.ObjectId, required: true },
    batchId: { type: mongoose.Types.ObjectId, ref: "RewardBatch", index: true },
    uidCode: { type: String, required: true },
    redeemedBy: { type: mongoose.Types.ObjectId, required: false },
    point: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    redeemedAt: { type: Date },
    isRedeemed: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

rewardSchema.virtual("product", {
  ref: "Product",
  localField: "productId",
  foreignField: "_id",
  justOne: true,
});

rewardSchema.index({ batchId: 1, isDeleted: 1, active: 1 });

const Reward = mongoose.model("Reward", rewardSchema);
module.exports = Reward;

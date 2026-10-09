const mongoose = require("mongoose");

const rewardBatchSchema = new mongoose.Schema(
  {
    batchUid: { type: String, required: true, trim: true },
    batchNumber: { type: Number, required: true, min: 1 },
    migrationKey: { type: String },
    productId: {
      type: mongoose.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    totalCount: { type: Number, required: true, default: 0 },
    activeCount: { type: Number, required: true, default: 0 },
    inactiveCount: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      enum: ["creating", "complete", "failed"],
      default: "creating",
      required: true,
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

rewardBatchSchema.index({ productId: 1, batchNumber: 1 }, { unique: true });
rewardBatchSchema.index({ productId: 1, batchUid: 1 }, { unique: true });
rewardBatchSchema.index({ status: 1, isDeleted: 1, createdAt: -1 });
rewardBatchSchema.index({
  status: 1,
  isDeleted: 1,
  productId: 1,
  createdAt: -1,
});
rewardBatchSchema.index({ batchUid: 1 });
rewardBatchSchema.index({ migrationKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("RewardBatch", rewardBatchSchema);

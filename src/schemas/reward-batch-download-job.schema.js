const mongoose = require("mongoose");

const rewardBatchDownloadJobSchema = new mongoose.Schema(
  {
    requestKey: { type: String, required: true, unique: true },
    batchId: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: "RewardBatch",
    },
    rewardIds: [{ type: mongoose.Types.ObjectId, ref: "Reward" }],
    state: {
      type: String,
      enum: ["active", "completed", "failed", "cancelled"],
      required: true,
    },
    progress: { type: mongoose.Schema.Types.Mixed },
    result: { type: mongoose.Schema.Types.Mixed },
    error: { type: String },
    leaseOwner: { type: String },
    leaseUntil: { type: Date },
    finishedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

rewardBatchDownloadJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model(
  "RewardBatchDownloadJob",
  rewardBatchDownloadJobSchema,
);

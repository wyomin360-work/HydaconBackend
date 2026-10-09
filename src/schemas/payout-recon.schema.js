const mongoose = require("mongoose");

const payoutReconSchema = new mongoose.Schema(
  {
    withdrawalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Withdrawal",
      required: true,
      index: true,
    },
    payoutId: { type: String, default: null, index: true },
    referenceId: { type: String, required: true },
    requestedAt: { type: Date, required: true },
    outcome: {
      type: String,
      enum: ["MATCHED", "NOT_FOUND", "MISMATCH", "ERROR"],
      required: true,
    },
    providerStatus: { type: String, default: null },
    providerResponse: { type: mongoose.Schema.Types.Mixed, default: {} },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

payoutReconSchema.index({ withdrawalId: 1, createdAt: -1 });

module.exports = mongoose.model("PayoutRecon", payoutReconSchema);

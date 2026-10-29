const mongoose = require("mongoose");
const {
  PAYOUT_PROVIDER,
  PAYOUT_PROVIDER_VALUES,
  PAYOUT_RECON_OUTCOME_VALUES,
} = require("../constants/payouts");

const payoutReconSchema = new mongoose.Schema(
  {
    withdrawalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Withdrawal",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: PAYOUT_PROVIDER_VALUES,
      default: PAYOUT_PROVIDER.RAZORPAYX,
      index: true,
    },
    providerTransferId: { type: String, default: null, index: true },
    payoutId: { type: String, default: null },
    providerReferenceId: { type: String, default: null, index: true },
    referenceId: { type: String, required: true },
    requestedAt: { type: Date, required: true },
    outcome: {
      type: String,
      enum: PAYOUT_RECON_OUTCOME_VALUES,
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

const mongoose = require("mongoose");
const {
  PAYOUT_PROVIDER,
  PAYOUT_PROVIDER_VALUES,
  PAYOUT_RECON_OUTCOME_VALUES,
  PAYOUT_OPERATION,
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
    retryAttempt: { type: Number, default: null, min: 1 },
    operation: {
      type: String,
      enum: Object.values(PAYOUT_OPERATION),
      default: null,
    },
    outcome: {
      type: String,
      enum: PAYOUT_RECON_OUTCOME_VALUES,
      required: true,
    },
    providerStatus: { type: String, default: null },
    providerStatusCode: { type: Number, default: null },
    providerErrorCode: { type: String, default: null },
    providerResponse: { type: mongoose.Schema.Types.Mixed, default: {} },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

payoutReconSchema.index({ withdrawalId: 1, createdAt: -1 });

module.exports = mongoose.model("PayoutRecon", payoutReconSchema);

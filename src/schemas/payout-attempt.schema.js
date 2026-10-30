const mongoose = require("mongoose");
const {
  PAYOUT_PROVIDER,
  PAYOUT_PROVIDER_VALUES,
  PAYOUT_ATTEMPT_OUTCOME_VALUES,
  PAYOUT_ATTEMPT_OUTCOME,
  PAYOUT_CURRENCY,
  PAYOUT_TRANSFER_MODE,
} = require("../constants/payouts");

const payoutAttemptSchema = new mongoose.Schema(
  {
    withdrawalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Withdrawal",
      required: true,
      index: true,
    },
    attemptNumber: { type: Number, required: true, min: 1 },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    provider: {
      type: String,
      enum: PAYOUT_PROVIDER_VALUES,
      default: PAYOUT_PROVIDER.RAZORPAYX,
      index: true,
    },
    idempotencyKey: { type: String, required: true },
    referenceId: { type: String, required: true },
    providerBatchReferenceId: { type: String, default: null, index: true },
    providerBatchTransferId: { type: String, default: null, index: true },
    providerBeneficiaryId: { type: String, default: null },
    fundAccountId: { type: String, default: null },
    amountMinor: { type: Number, default: null },
    amount: { type: Number, default: null },
    currency: { type: String, default: PAYOUT_CURRENCY.INR },
    mode: { type: String, default: PAYOUT_TRANSFER_MODE.IMPS },
    purpose: { type: String, default: "payout" },
    narration: { type: String, default: null },
    queueIfLowBalance: { type: Boolean, default: true },
    requestStartedAt: { type: Date, required: true },
    responseReceivedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    outcome: {
      type: String,
      enum: PAYOUT_ATTEMPT_OUTCOME_VALUES,
      default: PAYOUT_ATTEMPT_OUTCOME.REQUESTED,
      required: true,
    },
    httpStatus: { type: Number, default: null },
    providerTransferId: { type: String, default: null, index: true },
    payoutId: { type: String, default: null },
    providerStatus: { type: String, default: null },
    providerErrorCode: { type: String, default: null },
    providerErrorDescription: { type: String, default: null },
    providerResponse: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);

payoutAttemptSchema.index(
  { withdrawalId: 1, attemptNumber: 1 },
  { unique: true },
);
payoutAttemptSchema.index({ payoutId: 1 }, { sparse: true });

module.exports = mongoose.model("PayoutAttempt", payoutAttemptSchema);

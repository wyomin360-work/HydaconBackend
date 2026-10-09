const mongoose = require("mongoose");

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
    idempotencyKey: { type: String, required: true },
    referenceId: { type: String, required: true },
    fundAccountId: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    mode: { type: String, default: "IMPS" },
    purpose: { type: String, default: "payout" },
    narration: { type: String, default: null },
    queueIfLowBalance: { type: Boolean, default: true },
    requestStartedAt: { type: Date, required: true },
    responseReceivedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    outcome: {
      type: String,
      enum: [
        "REQUESTED",
        "SUCCEEDED",
        "DEFINITIVE_FAILURE",
        "AMBIGUOUS_FAILURE",
      ],
      default: "REQUESTED",
      required: true,
    },
    httpStatus: { type: Number, default: null },
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

module.exports = mongoose.model(
  "PayoutAttempt",
  payoutAttemptSchema,
);

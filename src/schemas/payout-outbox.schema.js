const mongoose = require("mongoose");
const {
  PAYOUT_PROVIDER_VALUES,
  PAYOUT_OUTBOX_STATUS,
  PAYOUT_OUTBOX_STATUS_VALUES,
  PAYOUT_CONFIG,
} = require("../constants/payouts");

const payoutOutboxSchema = new mongoose.Schema(
  {
    withdrawalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Withdrawal",
      required: true,
      unique: true,
      index: true,
    },
    provider: {
      type: String,
      enum: PAYOUT_PROVIDER_VALUES,
      required: true,
      index: true,
    },
    providerReferenceId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: PAYOUT_OUTBOX_STATUS_VALUES,
      default: PAYOUT_OUTBOX_STATUS.PENDING,
      index: true,
    },
    attempts: {
      type: Number,
      default: PAYOUT_CONFIG.OUTBOX_DEFAULT_ATTEMPTS,
      min: PAYOUT_CONFIG.OUTBOX_MINIMUM_ATTEMPTS,
    },
    availableAt: { type: Date, default: Date.now, index: true },
    leaseExpiresAt: { type: Date, default: null, index: true },
    lastError: { type: String, default: null },
    lastProviderStatus: { type: String, default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

payoutOutboxSchema.index({ status: 1, availableAt: 1, leaseExpiresAt: 1 });

module.exports = mongoose.model("PayoutOutbox", payoutOutboxSchema);

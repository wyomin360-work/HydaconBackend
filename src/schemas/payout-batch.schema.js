const mongoose = require("mongoose");
const {
  PAYOUT_PROVIDER,
  PAYOUT_BATCH_STATUS,
  PAYOUT_CONFIG,
} = require("../constants/payouts");

const payoutBatchSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: [PAYOUT_PROVIDER.CASHFREE],
      required: true,
      default: PAYOUT_PROVIDER.CASHFREE,
      index: true,
    },
    batchReferenceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    providerBatchTransferId: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: Object.values(PAYOUT_BATCH_STATUS),
      default: PAYOUT_BATCH_STATUS.PENDING,
      required: true,
      index: true,
    },
    withdrawalCount: {
      type: Number,
      required: true,
      min: PAYOUT_CONFIG.CASHFREE_BATCH_MIN_SIZE,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    attempts: {
      type: Number,
      default: PAYOUT_CONFIG.OUTBOX_DEFAULT_ATTEMPTS,
      min: PAYOUT_CONFIG.OUTBOX_MINIMUM_ATTEMPTS,
    },
    availableAt: { type: Date, default: Date.now, index: true },
    leaseExpiresAt: { type: Date, default: null, index: true },
    lastError: { type: String, default: null },
    providerStatus: { type: String, default: null },
    providerResponse: { type: mongoose.Schema.Types.Mixed, default: {} },
    providerResponseReceivedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

payoutBatchSchema.index({ status: 1, availableAt: 1, leaseExpiresAt: 1 });

module.exports = mongoose.model("PayoutBatch", payoutBatchSchema);

const mongoose = require("mongoose");
const {
  PAYOUT_PROVIDER,
  PAYOUT_EVENT_PROVIDER_VALUES,
  PAYOUT_EVENT_STATUS_VALUES,
  PAYOUT_SOURCE,
  PAYOUT_DELIVERY_SOURCE_VALUES,
} = require("../constants/payouts");

const payoutEventSchema = new mongoose.Schema(
  {
    dedupeKey: { type: String, required: true, unique: true },
    provider: {
      type: String,
      enum: PAYOUT_EVENT_PROVIDER_VALUES,
      default: PAYOUT_PROVIDER.RAZORPAYX,
      index: true,
    },
    providerEventId: { type: String, default: null, index: true },
    eventType: { type: String, required: true, index: true },
    deliverySource: {
      type: String,
      enum: PAYOUT_DELIVERY_SOURCE_VALUES,
      default: PAYOUT_SOURCE.WEBHOOK,
    },
    providerTransferId: { type: String, default: null, index: true },
    providerReferenceId: { type: String, default: null, index: true },
    payoutId: { type: String, default: null },
    referenceId: { type: String, default: null },
    providerStatus: { type: String, default: null },
    payloadHash: { type: String, required: true },
    safePayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    processingStatus: {
      type: String,
      enum: PAYOUT_EVENT_STATUS_VALUES,
      default: PAYOUT_EVENT_STATUS.RECEIVED,
      index: true,
    },
    processingAttempts: { type: Number, default: 0 },
    processingStartedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    result: { type: String, default: null },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

payoutEventSchema.index({ processingStatus: 1, updatedAt: 1 });

module.exports = mongoose.model("PayoutEvent", payoutEventSchema);

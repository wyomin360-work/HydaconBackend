const mongoose = require("mongoose");

const payoutEventSchema = new mongoose.Schema(
  {
    dedupeKey: { type: String, required: true, unique: true },
    providerEventId: { type: String, default: null, index: true },
    eventType: { type: String, required: true, index: true },
    deliverySource: {
      type: String,
      enum: ["WEBHOOK", "RECONCILIATION"],
      default: "WEBHOOK",
    },
    payoutId: { type: String, default: null, index: true },
    referenceId: { type: String, default: null, index: true },
    providerStatus: { type: String, default: null },
    payloadHash: { type: String, required: true },
    safePayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    processingStatus: {
      type: String,
      enum: ["RECEIVED", "PROCESSING", "PROCESSED", "IGNORED", "FAILED"],
      default: "RECEIVED",
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

module.exports = mongoose.model(
  "PayoutEvent",
  payoutEventSchema,
);

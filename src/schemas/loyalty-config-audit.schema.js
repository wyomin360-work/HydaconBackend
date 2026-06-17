const mongoose = require("mongoose");
const { AUDIT_LOG_ACTIONS } = require("../constants/audit-logs");

const fieldChangeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const loyaltyConfigAuditSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: Object.values(AUDIT_LOG_ACTIONS),
      required: true,
      index: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    seasonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoyaltySeason",
      default: null,
      index: true,
    },
    tierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tier",
      default: null,
      index: true,
    },
    tierConfigurationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TierConfiguration",
      default: null,
      index: true,
    },
    seasonName: { type: String, default: null },
    tierName: { type: String, default: null },
    changes: { type: [fieldChangeSchema], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    changedAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
  },
);

loyaltyConfigAuditSchema.index({ seasonId: 1, changedAt: -1 });
loyaltyConfigAuditSchema.index({ tierConfigurationId: 1, changedAt: -1 });

const LoyaltyConfigAuditLog = mongoose.model(
  "LoyaltyConfigAuditLog",
  loyaltyConfigAuditSchema,
  "LoyaltyConfigAuditLogs",
);

module.exports = LoyaltyConfigAuditLog;

const mongoose = require("mongoose");

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
      enum: [
        "SEASON_CREATED",
        "SEASON_UPDATED",
        "SEASON_ACTIVATED",
        "SEASON_DEACTIVATED",
        "SEASON_DELETED",
        "TIER_CONFIG_CREATED",
        "TIER_CONFIG_UPDATED",
        "TIER_CONFIG_DELETED",
      ],
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

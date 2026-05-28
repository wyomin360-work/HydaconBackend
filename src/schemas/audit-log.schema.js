const { default: mongoose } = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["PHONE_NUMBER_CHANGE"],
      default: "PHONE_NUMBER_CHANGE",
      index: true,
    },
    old_number: {
      type: String,
      default: null,
    },
    new_number: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
    ip_address: {
      type: String,
      default: null,
    },
    device_info: {
      user_agent: { type: String, default: null },
      device_id: { type: String, default: null },
      device_name: { type: String, default: null },
      platform: { type: String, default: null },
      app_version: { type: String, default: null },
    },
  },
  {
    timestamps: true,
  },
);

auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ user_id: 1, action: 1, timestamp: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema, "AuditLogs");

module.exports = AuditLog;

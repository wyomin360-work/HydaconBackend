const { default: mongoose } = require("mongoose");

const { AUDIT_LOG_ACTIONS } = require("../constants/audit-logs");

const deviceInfoSchema = new mongoose.Schema(
  {
    userAgent: { type: String, default: null },
    deviceId: { type: String, default: null },
    deviceName: { type: String, default: null },
    platform: { type: String, default: null },
    appVersion: { type: String, default: null },
  },
  { _id: false },
);

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: Object.values(AUDIT_LOG_ACTIONS),
      default: AUDIT_LOG_ACTIONS.PHONE_NUMBER_CHANGE,
      index: true,
    },
    oldNumber: {
      type: String,
      default: null,
    },
    newNumber: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    deviceInfo: {
      type: deviceInfoSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  },
);

auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, action: 1, timestamp: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema, "AuditLogs");

module.exports = AuditLog;

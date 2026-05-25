const { default: mongoose } = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    old_value: {
      type: String,
      default: null,
    },
    new_value: {
      type: String,
      required: true,
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
  },
  {
    timestamps: true,
  },
);

const AuditLog = mongoose.model("AuditLog", auditLogSchema, "AuditLogs");

module.exports = AuditLog;

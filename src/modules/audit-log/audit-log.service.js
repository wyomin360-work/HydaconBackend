const AuditLog = require("../../schemas/audit-log.schema");
const LoyaltyConfigAuditLog = require("../../schemas/loyalty-config-audit.schema");
const { AUDIT_LOG_ACTIONS } = require("../../constants/audit-logs");

/**
 * Creates an audit log entry. Supports custom mongoose sessions for transactions.
 */
async function logAudit(action, data, options = {}) {
  const session = options.session || null;

  if (action === AUDIT_LOG_ACTIONS.PHONE_NUMBER_CHANGE) {
    const doc = new AuditLog({
      userId: data.userId,
      action,
      oldNumber: data.oldNumber,
      newNumber: data.newNumber,
      ipAddress: data.ipAddress || null,
      deviceInfo: {
        userAgent: data.deviceInfo?.userAgent || null,
        deviceId: data.deviceInfo?.deviceId || null,
        deviceName: data.deviceInfo?.deviceName || null,
        platform: data.deviceInfo?.platform || null,
        appVersion: data.deviceInfo?.appVersion || null,
      },
      timestamp: new Date(),
    });
    return doc.save({ session });
  } else {
    // Loyalty config and season actions
    const doc = new LoyaltyConfigAuditLog({
      action,
      changedBy: data.changedBy,
      seasonId: data.seasonId || null,
      tierId: data.tierId || null,
      tierConfigurationId: data.tierConfigurationId || null,
      seasonName: data.seasonName || null,
      tierName: data.tierName || null,
      changes: data.changes || [],
      metadata: data.metadata || {},
      changedAt: new Date(),
    });
    return doc.save({ session });
  }
}

/**
 * Compares two objects on specific fields and returns a changes list.
 */
function buildChanges(oldData = {}, newData = {}, fields = []) {
  return fields
    .map((field) => ({
      field,
      oldValue: oldData?.[field] ?? null,
      newValue: newData?.[field] ?? null,
    }))
    .filter(
      (change) =>
        JSON.stringify(change.oldValue) !== JSON.stringify(change.newValue),
    );
}

/**
 * Deletes all audit logs from the database.
 */
async function clearAllAuditLogs() {
  await Promise.all([
    AuditLog.deleteMany({}),
    LoyaltyConfigAuditLog.deleteMany({}),
  ]);
  console.log(
    "🧹 All audit logs have been successfully cleared from the database.",
  );
}

module.exports = {
  logAudit,
  buildChanges,
  clearAllAuditLogs,
};

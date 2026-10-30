const SYSTEM_ALERT_SEVERITY = Object.freeze({
  WARNING: "warning",
  HIGH: "high",
  CRITICAL: "critical",
});

const SYSTEM_ALERT_SOURCE = Object.freeze({
  APPLICATION: "HydaconBackend",
  PAYOUTS: "payouts",
  SYSTEM: "system",
});

const SYSTEM_ALERT_TYPE = Object.freeze({
  UNKNOWN: "SYSTEM_ALERT",
});

const SYSTEM_ALERT_TEXT = Object.freeze({
  UNKNOWN_SUMMARY: "High-severity system alert",
  NO_ERROR: "No error message was provided.",
  NO_RAW_ERROR: "No raw error was provided.",
  CONTEXT_TRUNCATED: "[TRUNCATED]",
});

const SYSTEM_ALERT_CONFIG = Object.freeze({
  EMAIL_TEMPLATE: "system/criticalAlert",
  COOLDOWN_MS: 5 * 60 * 1000,
  MAX_THROTTLE_KEYS: 1000,
  MAX_ERROR_LENGTH: 8000,
  MAX_CONTEXT_LENGTH: 8000,
  MAX_EMAIL_SUBJECT_LENGTH: 160,
});

const SYSTEM_ALERT_MESSAGE = Object.freeze({
  MANAGER_EMAIL_MISSING:
    "High-severity system alerts are not emailed because SYSTEM_MANAGER_EMAIL is not configured",
  EMAIL_DELIVERY_FAILED: "High-severity system alert email delivery failed",
});

module.exports = {
  SYSTEM_ALERT_SEVERITY,
  SYSTEM_ALERT_SOURCE,
  SYSTEM_ALERT_TYPE,
  SYSTEM_ALERT_TEXT,
  SYSTEM_ALERT_CONFIG,
  SYSTEM_ALERT_MESSAGE,
};

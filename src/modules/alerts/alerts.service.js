const { sendTemplateEmail } = require("../../functions/nodemailer");
const logger = require("../../config/pino.config");
const {
  SYSTEM_ALERT_SEVERITY,
  SYSTEM_ALERT_SOURCE,
  SYSTEM_ALERT_TYPE,
  SYSTEM_ALERT_TEXT,
  SYSTEM_ALERT_CONFIG,
  SYSTEM_ALERT_MESSAGE,
} = require("../../constants/alerts");
const {
  sanitizeAlertText,
  sanitizeAlertValue,
} = require("../../utils/alert-sanitizer");

const lastEmailByAlertKey = new Map();
let missingManagerEmailLogged = false;

function isSystemManagerEmailConfigured() {
  return Boolean(process.env.SYSTEM_MANAGER_EMAIL?.trim());
}

function isEmailAlertSeverity(severity) {
  return [SYSTEM_ALERT_SEVERITY.HIGH, SYSTEM_ALERT_SEVERITY.CRITICAL].includes(
    String(severity || "").toLowerCase(),
  );
}

function alertKeyFor(alert) {
  return (
    alert.alertKey ||
    [
      alert.source || SYSTEM_ALERT_SOURCE.SYSTEM,
      alert.type || SYSTEM_ALERT_TYPE.UNKNOWN,
      alert.provider || "",
    ]
      .concat(alert.withdrawalId || alert.batchReferenceId || "")
      .join(":")
  );
}

function shouldSendEmail(alertKey, now = Date.now()) {
  const previousSentAt = lastEmailByAlertKey.get(alertKey);
  if (
    previousSentAt &&
    now - previousSentAt < SYSTEM_ALERT_CONFIG.COOLDOWN_MS
  ) {
    return false;
  }

  lastEmailByAlertKey.set(alertKey, now);
  pruneEmailThrottleKeys(now);
  return true;
}

function pruneEmailThrottleKeys(now) {
  if (lastEmailByAlertKey.size <= SYSTEM_ALERT_CONFIG.MAX_THROTTLE_KEYS) return;

  for (const [key, sentAt] of lastEmailByAlertKey) {
    if (now - sentAt >= SYSTEM_ALERT_CONFIG.COOLDOWN_MS) {
      lastEmailByAlertKey.delete(key);
    }
  }
}

function getSafeErrorDetails(error) {
  if (!error) {
    return {
      errorMessage: SYSTEM_ALERT_TEXT.NO_ERROR,
      rawError: SYSTEM_ALERT_TEXT.NO_RAW_ERROR,
    };
  }

  const errorMessage = typeof error === "string" ? error : error.message;
  const rawError =
    typeof error === "string"
      ? error
      : [
          error.stack || error.message,
          error.code ? `Error code: ${error.code}` : null,
          error.statusCode ? `Status code: ${error.statusCode}` : null,
          error.providerStatusCode
            ? `Provider status: ${error.providerStatusCode}`
            : null,
          error.providerErrorCode
            ? `Provider error code: ${error.providerErrorCode}`
            : null,
        ]
          .filter(Boolean)
          .join("\n");

  return {
    errorMessage: sanitizeAlertText(errorMessage || String(error)),
    rawError: sanitizeAlertText(rawError || String(error)),
  };
}

function formatContext(context = {}) {
  const safeContext = JSON.stringify(sanitizeAlertValue(context), null, 2);
  if (safeContext.length <= SYSTEM_ALERT_CONFIG.MAX_CONTEXT_LENGTH) {
    return safeContext;
  }

  return `${safeContext.slice(0, SYSTEM_ALERT_CONFIG.MAX_CONTEXT_LENGTH)}\n${SYSTEM_ALERT_TEXT.CONTEXT_TRUNCATED}`;
}

function emailSubject(alert) {
  const summary = alert.summary || SYSTEM_ALERT_TEXT.UNKNOWN_SUMMARY;
  const subject = `[${alert.severity.toUpperCase()}] ${summary}`;
  return sanitizeAlertText(
    subject,
    SYSTEM_ALERT_CONFIG.MAX_EMAIL_SUBJECT_LENGTH,
  ).replace(/[\r\n]+/g, " ");
}

function logMissingManagerEmail(alert) {
  if (missingManagerEmailLogged) return;
  missingManagerEmailLogged = true;
  logger.error(SYSTEM_ALERT_MESSAGE.MANAGER_EMAIL_MISSING, {
    source: alert.source || null,
    alertType: alert.type || null,
  });
}

async function sendSystemAlertEmail(alert) {
  if (!isEmailAlertSeverity(alert.severity)) return;

  const managerEmail = process.env.SYSTEM_MANAGER_EMAIL?.trim();
  if (!managerEmail) {
    logMissingManagerEmail(alert);
    return;
  }

  const alertKey = alertKeyFor(alert);
  if (!shouldSendEmail(alertKey)) return;

  const safeError = getSafeErrorDetails(alert.error);
  const safeContext = formatContext({
    ...(alert.provider ? { provider: alert.provider } : {}),
    ...(alert.withdrawalId ? { withdrawalId: alert.withdrawalId } : {}),
    ...(alert.batchReferenceId
      ? { batchReferenceId: alert.batchReferenceId }
      : {}),
    ...(alert.context || {}),
    ...(alert.details || {}),
  });
  const delivered = await sendTemplateEmail(
    managerEmail,
    SYSTEM_ALERT_CONFIG.EMAIL_TEMPLATE,
    emailSubject(alert),
    {
      severity: alert.severity.toUpperCase(),
      source: sanitizeAlertText(
        alert.source || SYSTEM_ALERT_SOURCE.APPLICATION,
      ),
      alertType: sanitizeAlertText(alert.type || SYSTEM_ALERT_TYPE.UNKNOWN),
      summary: sanitizeAlertText(
        alert.summary || SYSTEM_ALERT_TEXT.UNKNOWN_SUMMARY,
      ),
      occurredAt: new Date().toISOString(),
      alertKey: sanitizeAlertText(alertKey),
      context: safeContext,
      errorMessage: safeError.errorMessage,
      rawError: safeError.rawError,
    },
  );

  if (!delivered) {
    logger.error(SYSTEM_ALERT_MESSAGE.EMAIL_DELIVERY_FAILED, {
      source: alert.source || null,
      alertType: alert.type || null,
      alertKey,
    });
  }
}

/** Sends a high-severity alert email without blocking payout or request work. */
function reportSystemAlert(alert) {
  Promise.resolve()
    .then(() => sendSystemAlertEmail(alert))
    .catch((error) => {
      logger.error(SYSTEM_ALERT_MESSAGE.EMAIL_DELIVERY_FAILED, {
        source: alert.source || null,
        alertType: alert.type || null,
        error: sanitizeAlertText(error.message),
      });
    });
}

module.exports = {
  isSystemManagerEmailConfigured,
  reportSystemAlert,
  sendSystemAlertEmail,
};

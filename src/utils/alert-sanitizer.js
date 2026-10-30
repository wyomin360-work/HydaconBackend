const { SYSTEM_ALERT_CONFIG } = require("../constants/alerts");

const SENSITIVE_FIELD_PATTERN =
  /authorization|secret|password|passwd|token|signature|api[_-]?key|private[_-]?key|account[_-]?number|ifsc|cvv|pan[_-]?number|\bpan\b|rawbody|headers|config|requestbody|payload|email|phone|mobile|aadhaar|ssn|card[_-]?number|cookie/i;

const SECRET_ASSIGNMENT_PATTERN =
  /([\w-]*(?:secret|api[_-]?key|password|passwd|authorization|access[_-]?token|refresh[_-]?token|token|signature|private[_-]?key|bank[_-]?account[_-]?number|account[_-]?number|ifsc|cvv|pan(?:[_-]?number)?|credential|cookie))\b["']?(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi;

function sanitizeAlertText(
  value,
  maxLength = SYSTEM_ALERT_CONFIG.MAX_ERROR_LENGTH,
) {
  if (value == null) return "";

  return String(value)
    .replace(
      /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gi,
      "[REDACTED_PRIVATE_KEY]",
    )
    .replace(
      /(\b(?:mongodb(?:\+srv)?|https?):\/\/[^:/\s]+:)[^@/\s]+@/gi,
      "$1[REDACTED]@",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+\b/gi, "[REDACTED_KEY]")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED_ACCESS_KEY]")
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
      "[REDACTED_TOKEN]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[REDACTED_TOKEN]",
    )
    .replace(SECRET_ASSIGNMENT_PATTERN, "$1$2[REDACTED]")
    .replace(
      /([?&](?:access_token|client_secret|api_key|signature|x-webhook-signature|token|password)=)[^&#\s]+/gi,
      "$1[REDACTED]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\b\d{8,}\b/g, "[REDACTED_NUMBER]")
    .slice(0, maxLength);
}

function sanitizeAlertValue(value, depth = 0) {
  if (depth > 5) return "[TRUNCATED]";
  if (value == null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Math.abs(value) >= 10000000 ? "[REDACTED_NUMBER]" : value;
  }
  if (typeof value === "string") {
    return sanitizeAlertText(value, SYSTEM_ALERT_CONFIG.MAX_CONTEXT_LENGTH);
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => sanitizeAlertValue(item, depth + 1));
  }
  if (typeof value !== "object") return String(value);

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 50)
      .map(([key, nestedValue]) => [
        key,
        SENSITIVE_FIELD_PATTERN.test(key)
          ? "[REDACTED]"
          : sanitizeAlertValue(nestedValue, depth + 1),
      ]),
  );
}

module.exports = { sanitizeAlertText, sanitizeAlertValue };

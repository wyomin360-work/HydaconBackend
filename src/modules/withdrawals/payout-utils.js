const { PAYOUT_CONFIG } = require("../../constants/payouts");

function safeText(value, maxLength = PAYOUT_CONFIG.MAX_ERROR_LENGTH) {
  return String(value || "")
    .replace(
      new RegExp(`\\d{${PAYOUT_CONFIG.REDACT_DIGIT_SEQUENCE_LENGTH},}`, "g"),
      "[redacted]",
    )
    .slice(0, maxLength);
}

module.exports = { safeText };

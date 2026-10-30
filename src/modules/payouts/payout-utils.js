const { PAYOUT_CONFIG } = require("../../constants/payouts");

function safeText(value, maxLength = PAYOUT_CONFIG.MAX_ERROR_LENGTH) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, maxLength);
}

module.exports = { safeText };

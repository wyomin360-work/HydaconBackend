const { reportSystemAlert } = require("../alerts/alerts.service");
const { SYSTEM_ALERT_SOURCE } = require("../../constants/alerts");

/** Adapts payout events to the shared application alerting module. */
function reportPayoutAlert(alert) {
  reportSystemAlert({
    ...alert,
    source: SYSTEM_ALERT_SOURCE.PAYOUTS,
  });
}

module.exports = { reportPayoutAlert };

# Shared system alerts

Use `src/modules/alerts/alerts.service.js` to email high-severity incidents to
the address configured by `SYSTEM_MANAGER_EMAIL`. Payout alerts use this same
module through `src/modules/payouts/payout-alerts.js`.

```javascript
const { SYSTEM_ALERT_SEVERITY } = require("../../constants/alerts");
const { reportSystemAlert } = require("../alerts/alerts.service");

reportSystemAlert({
  source: "payments",
  type: "PAYMENT_RECONCILIATION_FAILED",
  severity: SYSTEM_ALERT_SEVERITY.CRITICAL,
  summary: "Payment reconciliation needs investigation",
  error,
  context: { paymentId },
});
```

The shared email template is `src/templates/system/criticalAlert.hbs`. Errors
are included as a message and stack after sanitization. Secret-bearing context
fields and values such as credentials, signatures, account numbers, and email
addresses are redacted. Do not pass full request objects, provider payloads,
headers, or arbitrary environment/config objects as alert context.

The sender runs asynchronously, only emails `high` and `critical` alerts, and
suppresses repeated alert keys for a short cooldown. Configure the mail
transport and `SYSTEM_MANAGER_EMAIL` in the production secret manager. Email
delivery failures are logged; this module does not persist alerts for later
delivery.

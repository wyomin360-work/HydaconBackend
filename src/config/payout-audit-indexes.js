const LedgerEntry = require("../schemas/ledger-entry.schema");
const PayoutAttempt = require("../schemas/payout-attempt.schema");
const PayoutEvent = require("../schemas/payout-event.schema");
const PayoutRecon = require("../schemas/payout-recon.schema");
const logger = require("./pino.config");

async function ensurePayoutAuditIndexes() {
  await Promise.all(
    [LedgerEntry, PayoutAttempt, PayoutEvent, PayoutRecon].map((model) =>
      model.createIndexes(),
    ),
  );
  logger.info("Payout audit indexes are ready");
}

module.exports = { ensurePayoutAuditIndexes };

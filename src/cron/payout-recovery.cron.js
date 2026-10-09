const cron = require("node-cron");
const Withdrawal = require("../schemas/withdrawal.schema");
const PayoutRecon = require("../schemas/payout-recon.schema");
const withdrawalsService = require("../modules/withdrawals/withdrawals.service");
const { fetchPayoutByReference: fetchProviderPayoutByReference } = require("../functions/razorpayx");
const { processWebhook } = require("../modules/webhooks/webhooks.service");
const logger = require("../config/pino.config");

function safePayoutSnapshot(payout) {
  const fields = [
    "id",
    "status",
    "reference_id",
    "amount",
    "currency",
    "mode",
    "purpose",
    "utr",
    "failure_reason",
  ];
  return Object.fromEntries(
    fields
      .filter((field) => payout?.[field] != null)
      .map((field) => [
        field,
        typeof payout[field] === "string"
          ? (field === "failure_reason"
              ? payout[field].replace(/\d{6,}/g, "[redacted]")
              : payout[field]
            ).slice(0, 500)
          : payout[field],
      ]),
  );
}

function eventForStatus(status) {
  return {
    queued: "payout.queued",
    pending: "payout.pending",
    processing: "payout.initiated",
    processed: "payout.processed",
    failed: "payout.failed",
    rejected: "payout.rejected",
    cancelled: "payout.cancelled",
    reversed: "payout.reversed",
  }[status];
}

function registerPayoutRecoveryCron() {
  cron.schedule("*/5 * * * *", async () => {
    try {
      const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
      const stuck = await Withdrawal.find({
        status: "PROCESSING",
        providerPayoutId: null,
        approvedAt: { $lt: staleBefore },
      })
        .select("_id approvedBy")
        .limit(25)
        .lean();

      for (const withdrawal of stuck) {
        try {
          await withdrawalsService.approveWithdrawal(
            withdrawal.approvedBy,
            withdrawal._id,
          );
        } catch (error) {
          logger.error("Payout provider retry failed", {
            withdrawalId: String(withdrawal._id),
            error: error.message,
          });
        }
      }
    } catch (error) {
      logger.error("Payout provider recovery scan failed", {
        error: error.message,
      });
    }
  });

  // Low-frequency recovery for payout IDs whose terminal webhook was missed.
  // payout provider recommends webhooks for routine updates; this is only for records
  // that have remained PROCESSING for at least 30 minutes.
  cron.schedule("0 * * * *", async () => {
    try {
      const staleBefore = new Date(Date.now() - 30 * 60 * 1000);
      const retryBefore = new Date(Date.now() - 60 * 60 * 1000);
      const stuck = await Withdrawal.find({
        status: "PROCESSING",
        providerPayoutId: { $ne: null },
        approvedAt: { $lt: staleBefore },
        $or: [
          { lastPayoutReconciledAt: null },
          { lastPayoutReconciledAt: { $lt: retryBefore } },
        ],
      })
        .select("_id providerPayoutId approvedAt cashAmount")
        .limit(50)
        .lean();

      for (const withdrawal of stuck) {
        const requestedAt = new Date();
        const claim = await Withdrawal.updateOne(
          {
            _id: withdrawal._id,
            status: "PROCESSING",
            providerPayoutId: withdrawal.providerPayoutId,
            $or: [
              { lastPayoutReconciledAt: null },
              { lastPayoutReconciledAt: { $lt: retryBefore } },
            ],
          },
          { $set: { lastPayoutReconciledAt: requestedAt } },
        );
        if (!claim.modifiedCount) continue;
        try {
          const payout = await fetchProviderPayoutByReference(
            String(withdrawal._id),
          );
          if (!payout) {
            await PayoutRecon.create({
              withdrawalId: withdrawal._id,
              payoutId: withdrawal.providerPayoutId,
              referenceId: String(withdrawal._id),
              requestedAt,
              outcome: "NOT_FOUND",
            });
            await Withdrawal.updateOne(
              { _id: withdrawal._id },
              { $set: { lastPayoutReconciledAt: new Date() } },
            );
            logger.error("Payout provider absent during reconciliation", {
              withdrawalId: String(withdrawal._id),
              payoutId: withdrawal.providerPayoutId,
            });
            continue;
          }

          const response = safePayoutSnapshot(payout);
          if (payout.id !== withdrawal.providerPayoutId) {
            await PayoutRecon.create({
              withdrawalId: withdrawal._id,
              payoutId: payout.id,
              referenceId: String(withdrawal._id),
              requestedAt,
              outcome: "MISMATCH",
              providerStatus: payout.status || null,
              providerResponse: {
                ...response,
                httpStatus: payout._httpStatus || null,
              },
              errorMessage:
                "Provider payout ID does not match the withdrawal record",
            });
            await Withdrawal.updateOne(
              { _id: withdrawal._id },
              { $set: { lastPayoutReconciledAt: new Date() } },
            );
            logger.error("Payout reconciliation payout ID mismatch", {
              withdrawalId: String(withdrawal._id),
              localPayoutId: withdrawal.providerPayoutId,
              providerPayoutId: payout.id,
            });
            continue;
          }
          const expectedAmount = Math.round(withdrawal.cashAmount * 100);
          if (
            (payout.amount != null &&
              Number(payout.amount) !== expectedAmount) ||
            (payout.currency && payout.currency !== "INR")
          ) {
            const mismatchReason =
              payout.currency && payout.currency !== "INR"
                ? "Provider payout currency does not match INR"
                : "Provider payout amount does not match withdrawal amount";
            await PayoutRecon.create({
              withdrawalId: withdrawal._id,
              payoutId: payout.id,
              referenceId: String(withdrawal._id),
              requestedAt,
              outcome: "MISMATCH",
              providerStatus: payout.status || null,
              providerResponse: {
                ...response,
                httpStatus: payout._httpStatus || null,
              },
              errorMessage: mismatchReason,
            });
            await Withdrawal.updateOne(
              { _id: withdrawal._id },
              { $set: { lastPayoutReconciledAt: new Date() } },
            );
            logger.error("Payout reconciliation amount/currency mismatch", {
              withdrawalId: String(withdrawal._id),
              payoutId: payout.id,
              expectedAmount,
              providerAmount: payout.amount ?? null,
              providerCurrency: payout.currency || null,
            });
            continue;
          }
          await PayoutRecon.create({
            withdrawalId: withdrawal._id,
            payoutId: payout.id,
            referenceId: String(withdrawal._id),
            requestedAt,
            outcome: "MATCHED",
            providerStatus: payout.status || null,
            providerResponse: {
              ...response,
              httpStatus: payout._httpStatus || null,
            },
          });
          await Withdrawal.updateOne(
            { _id: withdrawal._id },
            { $set: { lastPayoutReconciledAt: new Date() } },
          );

          const event = eventForStatus(payout.status);
          if (event) {
            const body = { event, payload: { payout: { entity: response } } };
            await processWebhook({}, Buffer.from(JSON.stringify(body)), body, {
              source: "RECONCILIATION",
            });
          } else {
            logger.warn(
              "Payout reconciliation returned an unmapped payout status",
              {
                withdrawalId: String(withdrawal._id),
                payoutId: payout.id,
                providerStatus: payout.status || null,
              },
            );
          }
        } catch (error) {
          await PayoutRecon.create({
            withdrawalId: withdrawal._id,
            payoutId: withdrawal.providerPayoutId,
            referenceId: String(withdrawal._id),
            requestedAt,
            outcome: "ERROR",
            errorMessage: String(error.message)
              .replace(/\d{6,}/g, "[redacted]")
              .slice(0, 500),
          });
          await Withdrawal.updateOne(
            { _id: withdrawal._id },
            { $set: { lastPayoutReconciledAt: new Date() } },
          );
          logger.error("Payout reconciliation failed", {
            withdrawalId: String(withdrawal._id),
            payoutId: withdrawal.providerPayoutId,
            error: error.message,
          });
        }
      }
    } catch (error) {
      logger.error("Payout reconciliation scan failed", {
        error: error.message,
      });
    }
  });
}

module.exports = { registerPayoutRecoveryCron };

const {
  RAZORPAYX_PAYOUT_EVENT,
  RAZORPAYX_PAYOUT_STATUS,
} = require("../../../../constants/payouts");
const { WITHDRAWAL_STATUS } = require("../../../../constants/withdrawals");

function mapStatus(event, payout = {}) {
  switch (event) {
    case RAZORPAYX_PAYOUT_EVENT.PROCESSED:
      return WITHDRAWAL_STATUS.COMPLETED;
    case RAZORPAYX_PAYOUT_EVENT.FAILED:
    case RAZORPAYX_PAYOUT_EVENT.REJECTED:
    case RAZORPAYX_PAYOUT_EVENT.CANCELLED:
      return WITHDRAWAL_STATUS.FAILED;
    case RAZORPAYX_PAYOUT_EVENT.REVERSED:
      return WITHDRAWAL_STATUS.REVERSED;
    case RAZORPAYX_PAYOUT_EVENT.QUEUED:
    case RAZORPAYX_PAYOUT_EVENT.PENDING:
    case RAZORPAYX_PAYOUT_EVENT.INITIATED:
    case RAZORPAYX_PAYOUT_EVENT.UPDATED:
      if (payout.status === RAZORPAYX_PAYOUT_STATUS.PROCESSED)
        return WITHDRAWAL_STATUS.COMPLETED;
      if (payout.status === RAZORPAYX_PAYOUT_STATUS.REVERSED)
        return WITHDRAWAL_STATUS.REVERSED;
      if (
        [
          RAZORPAYX_PAYOUT_STATUS.FAILED,
          RAZORPAYX_PAYOUT_STATUS.REJECTED,
          RAZORPAYX_PAYOUT_STATUS.CANCELLED,
        ].includes(payout.status)
      )
        return WITHDRAWAL_STATUS.FAILED;
      return WITHDRAWAL_STATUS.PROCESSING;
    default:
      return null;
  }
}

function normalizeTransfer(payout = {}) {
  return {
    providerTransferId: payout.id || null,
    providerReferenceId: payout.reference_id || null,
    status: String(payout.status || "").toUpperCase(),
    amountMinor: payout.amount == null ? null : Number(payout.amount),
    currency: payout.currency || null,
    transferMode: payout.mode || null,
    utr: payout.utr || null,
    failureReason: payout.failure_reason || null,
    rawStatus: payout.status || null,
  };
}

function normalizeWebhook(body = {}, headers = {}) {
  const payout = body?.payload?.payout?.entity || {};
  return {
    eventType: body.event || "unknown",
    providerEventId: headers["x-razorpay-event-id"] || null,
    ...normalizeTransfer(payout),
    targetStatus: mapStatus(body.event, payout),
    safePayload: {
      event: body.event || "unknown",
      ...Object.fromEntries(
        [
          "id",
          "reference_id",
          "status",
          "amount",
          "currency",
          "mode",
          "utr",
          "failure_reason",
          "created_at",
          "updated_at",
        ]
          .filter((field) => payout[field] != null)
          .map((field) => [
            field,
            typeof payout[field] === "string"
              ? String(payout[field])
                  .replace(/\d{6,}/g, "[redacted]")
                  .slice(0, 500)
              : payout[field],
          ]),
      ),
    },
  };
}

function normalizeTransferResponse(payout = {}) {
  const transfer = normalizeTransfer(payout);
  return {
    ...transfer,
    targetStatus: mapStatus(`payout.${payout.status}`, payout),
    safeResponse: Object.fromEntries(
      [
        "id",
        "status",
        "amount",
        "currency",
        "mode",
        "purpose",
        "reference_id",
        "fees",
        "tax",
        "utr",
        "failure_reason",
      ]
        .filter((field) => payout[field] != null)
        .map((field) => [
          field,
          typeof payout[field] === "string"
            ? String(payout[field])
                .replace(/\d{6,}/g, "[redacted]")
                .slice(0, 500)
            : payout[field],
        ]),
    ),
  };
}

module.exports = {
  mapStatus,
  normalizeTransfer,
  normalizeWebhook,
  normalizeTransferResponse,
};

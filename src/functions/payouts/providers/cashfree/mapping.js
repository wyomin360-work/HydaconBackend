const {
  CASHFREE_PAYOUT_EVENT,
  CASHFREE_PAYOUT_STATUS,
  CASHFREE_PAYOUT_STATUS_CODE,
  CASHFREE_PAYOUT_TRANSFER_EVENTS,
  PAYOUT_CURRENCY,
} = require("../../../../constants/payouts");
const { WITHDRAWAL_STATUS } = require("../../../../constants/withdrawals");

const SAFE_WEBHOOK_FIELDS = Object.freeze([
  "transfer_id",
  "cf_transfer_id",
  "status",
  "status_code",
  "status_description",
  "transfer_amount",
  "transfer_mode",
  "transfer_utr",
  "fundsource_id",
  "added_on",
  "updated_on",
  "batch_transfer_id",
  "cf_batch_transfer_id",
  "current_balance",
  "ledger_balance",
  "amount",
  "utr",
  "bene_entity",
  "id",
  "mode",
  "started_at",
  "is_scheduled",
  "severity",
  "entity_name",
  "entity_code",
  "resolved_at",
]);

function isTransferEvent(type) {
  return CASHFREE_PAYOUT_TRANSFER_EVENTS.includes(type);
}

function isBatchEvent(type) {
  return type === CASHFREE_PAYOUT_EVENT.BULK_TRANSFER_REJECTED;
}

function safeWebhookValue(value) {
  if (typeof value !== "string") return value;
  return value.replace(/\d{6,}/g, "[redacted]").slice(0, 500);
}

function targetStatus(type, data = {}) {
  if (
    type === CASHFREE_PAYOUT_EVENT.TRANSFER_REVERSED ||
    data.status === CASHFREE_PAYOUT_STATUS.REVERSED
  )
    return WITHDRAWAL_STATUS.REVERSED;
  if (
    data.status === CASHFREE_PAYOUT_STATUS.SUCCESS &&
    data.status_code === CASHFREE_PAYOUT_STATUS_CODE.COMPLETED
  )
    return WITHDRAWAL_STATUS.COMPLETED;
  if (
    data.status === CASHFREE_PAYOUT_STATUS.SUCCESS &&
    data.status_code === CASHFREE_PAYOUT_STATUS_CODE.SENT_TO_BENEFICIARY
  ) {
    return WITHDRAWAL_STATUS.PROCESSING;
  }
  if (
    [
      CASHFREE_PAYOUT_EVENT.TRANSFER_FAILED,
      CASHFREE_PAYOUT_EVENT.TRANSFER_REJECTED,
    ].includes(type) ||
    [CASHFREE_PAYOUT_STATUS.FAILED, CASHFREE_PAYOUT_STATUS.REJECTED].includes(
      data.status,
    )
  )
    return WITHDRAWAL_STATUS.FAILED;
  if (data.status === CASHFREE_PAYOUT_STATUS.APPROVAL_PENDING)
    return WITHDRAWAL_STATUS.PROCESSING;
  if (
    [
      CASHFREE_PAYOUT_EVENT.TRANSFER_ACKNOWLEDGED,
      CASHFREE_PAYOUT_EVENT.TRANSFER_SUCCESS,
    ].includes(type)
  ) {
    // Do not treat an event name alone as proof of final transfer completion.
    return data.status === CASHFREE_PAYOUT_STATUS.SUCCESS &&
      data.status_code === CASHFREE_PAYOUT_STATUS_CODE.COMPLETED
      ? WITHDRAWAL_STATUS.COMPLETED
      : WITHDRAWAL_STATUS.PROCESSING;
  }
  if (
    [
      CASHFREE_PAYOUT_STATUS.RECEIVED,
      CASHFREE_PAYOUT_STATUS.PENDING,
      CASHFREE_PAYOUT_STATUS.PROCESSING,
      CASHFREE_PAYOUT_STATUS.APPROVAL_PENDING,
    ].includes(data.status)
  )
    return WITHDRAWAL_STATUS.PROCESSING;
  return null;
}

function normalizeTransfer(data = {}) {
  const amount =
    data.transfer_amount == null ? null : Number(data.transfer_amount);
  return {
    providerTransferId: data.cf_transfer_id || null,
    providerReferenceId: data.transfer_id || null,
    status: data.status || null,
    statusCode: data.status_code || null,
    targetStatus: targetStatus(data.type, data),
    amountMinor: amount == null ? null : Math.round(amount * 100),
    currency: PAYOUT_CURRENCY.INR,
    transferMode: data.transfer_mode || null,
    utr: data.transfer_utr || null,
    failureReason: data.status_description || data.status_code || null,
    rawStatus: data.status || null,
  };
}

function normalizeWebhook(body = {}) {
  const data = body.data || {};
  const normalized = normalizeTransfer({ ...data, type: body.type });
  const safeData = {};
  for (const field of SAFE_WEBHOOK_FIELDS) {
    if (data[field] != null) safeData[field] = safeWebhookValue(data[field]);
  }
  const beneficiaryId = data.beneficiary_details?.beneficiary_id;
  if (beneficiaryId) {
    safeData.beneficiary_details = {
      beneficiary_id: safeWebhookValue(beneficiaryId),
    };
  }
  return {
    ...normalized,
    isTransferEvent: isTransferEvent(body.type),
    isBatchEvent: isBatchEvent(body.type),
    batchReferenceId: data.batch_transfer_id || null,
    providerBatchTransferId: data.cf_batch_transfer_id || null,
    eventType: body.type || "unknown",
    // Cashfree V2 documents signature and timestamp headers, but no event ID.
    // The webhook service uses the raw-payload hash for retry deduplication.
    providerEventId: null,
    eventTime: body.event_time || null,
    safePayload: {
      type: body.type || "unknown",
      event_time: body.event_time || null,
      data: safeData,
    },
  };
}

function normalizeTransferResponse(data = {}) {
  const normalized = normalizeTransfer(data);
  const safeResponse = {};
  for (const field of [
    "transfer_id",
    "cf_transfer_id",
    "status",
    "status_code",
    "status_description",
    "transfer_amount",
    "transfer_mode",
    "transfer_service_charge",
    "transfer_service_tax",
    "transfer_utr",
    "fundsource_id",
    "added_on",
    "updated_on",
  ]) {
    if (data[field] != null) safeResponse[field] = data[field];
  }
  return { ...normalized, safeResponse };
}

function normalizeBatchTransferResponse(data = {}) {
  return {
    batchReferenceId: data.batch_transfer_id || null,
    providerBatchTransferId: data.cf_batch_transfer_id || null,
    status: data.status || null,
    transfers: Array.isArray(data.transfers)
      ? data.transfers.map((transfer) => normalizeTransfer(transfer))
      : [],
    httpStatus: data._httpStatus || null,
    safeResponse: {
      ...(data.batch_transfer_id
        ? { batch_transfer_id: safeWebhookValue(data.batch_transfer_id) }
        : {}),
      ...(data.cf_batch_transfer_id
        ? { cf_batch_transfer_id: safeWebhookValue(data.cf_batch_transfer_id) }
        : {}),
      ...(data.status ? { status: safeWebhookValue(data.status) } : {}),
    },
  };
}

module.exports = {
  isTransferEvent,
  isBatchEvent,
  targetStatus,
  normalizeTransfer,
  normalizeWebhook,
  normalizeTransferResponse,
  normalizeBatchTransferResponse,
};

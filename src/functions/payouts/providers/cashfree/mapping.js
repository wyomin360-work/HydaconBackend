const {
  CASHFREE_PAYOUT_EVENT,
  CASHFREE_PAYOUT_STATUS,
  CASHFREE_PAYOUT_STATUS_CODE,
  PAYOUT_CURRENCY,
} = require("../../../../constants/payouts");
const { WITHDRAWAL_STATUS } = require("../../../../constants/withdrawals");

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

function normalizeWebhook(body = {}, headers = {}) {
  const data = body.data || {};
  const normalized = normalizeTransfer({ ...data, type: body.type });
  const safeData = {};
  for (const field of [
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
  ]) {
    if (data[field] != null) {
      safeData[field] =
        typeof data[field] === "string"
          ? String(data[field])
              .replace(/\d{6,}/g, "[redacted]")
              .slice(0, 500)
          : data[field];
    }
  }
  return {
    ...normalized,
    eventType: body.type || "unknown",
    providerEventId: headers["x-idempotency-key"] || null,
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

module.exports = {
  targetStatus,
  normalizeTransfer,
  normalizeWebhook,
  normalizeTransferResponse,
};

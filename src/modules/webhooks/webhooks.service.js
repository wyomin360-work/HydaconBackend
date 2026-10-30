const crypto = require("crypto");
const {
  PAYOUT_PROVIDER,
  CASHFREE_PAYOUT_EVENT,
  PAYOUT_EVENT_STATUS,
  PAYOUT_SOURCE,
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
  PAYOUT_RESULT,
  PAYOUT_HTTP_STATUS,
} = require("../../constants/payouts");
const Withdrawal = require("../../schemas/withdrawal.schema");
const PayoutEvent = require("../../schemas/payout-event.schema");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { getProvider, currentProviderName } = require("../../functions/payouts");
const { applyTransferUpdate } = require("../payouts/payout-state.service");
const {
  queueCashfreeBatchReconciliation,
} = require("../payouts/payout-batch.service");
const { safeText } = require("../payouts/payout-utils");
const logger = require("../../config/pino.config");

function verifySignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || !signature || !secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const expectedBytes = Buffer.from(expected, "ascii");
  const actualBytes = Buffer.from(String(signature), "ascii");
  return (
    expectedBytes.length === actualBytes.length &&
    crypto.timingSafeEqual(expectedBytes, actualBytes)
  );
}

async function processWebhookInternal(
  headers = {},
  rawBody,
  body,
  options = {},
) {
  const source = options.source || PAYOUT_SOURCE.WEBHOOK;
  const providerName = options.provider || currentProviderName();
  const provider = getProvider(providerName);
  if (source === PAYOUT_SOURCE.WEBHOOK)
    provider.verifyWebhook(headers, rawBody);
  if (!Buffer.isBuffer(rawBody)) {
    const error = new Error(PAYOUT_MESSAGE.RAW_BODY_MISSING);
    error.statusCode = PAYOUT_HTTP_STATUS.BAD_REQUEST;
    throw error;
  }
  const normalized =
    options.normalized || provider.normalizeWebhook(body, headers);
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const providerEventId = normalized.providerEventId || null;
  const dedupeKey = `${providerName}:${source.toLowerCase()}:${providerEventId || payloadHash}`;
  const eventDoc = await getOrCreateEvent({
    dedupeKey,
    providerName,
    providerEventId,
    source,
    normalized,
    payloadHash,
  });
  if (isEventAlreadyHandled(eventDoc)) {
    return { status: PAYOUT_RESULT.SUCCESS, processed: false, duplicate: true };
  }

  const claimed = await claimEvent(eventDoc);
  try {
    return await processClaimedEvent({
      claimed,
      providerName,
      source,
      normalized,
    });
  } catch (error) {
    await markEventFailed(claimed, error);
    logger.error(PAYOUT_MESSAGE.WEBHOOK_PROCESSING_FAILED, {
      provider: providerName,
      eventId: providerEventId || dedupeKey,
      error: safeText(error.message),
    });
    throw error;
  }
}

async function getOrCreateEvent({
  dedupeKey,
  providerName,
  providerEventId,
  source,
  normalized,
  payloadHash,
}) {
  return PayoutEvent.findOneAndUpdate(
    { dedupeKey },
    {
      $setOnInsert: {
        dedupeKey,
        provider: providerName,
        providerEventId,
        eventType: normalized.eventType || PAYOUT_PROVIDER.UNKNOWN,
        deliverySource: source,
        providerTransferId: normalized.providerTransferId || null,
        providerReferenceId: normalized.providerReferenceId || null,
        payoutId: normalized.providerTransferId || null,
        referenceId: normalized.providerReferenceId || null,
        providerStatus: normalized.rawStatus || normalized.status || null,
        payloadHash,
        safePayload: normalized.safePayload || {},
        processingStatus: PAYOUT_EVENT_STATUS.RECEIVED,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

function isEventAlreadyHandled(eventDoc) {
  return [PAYOUT_EVENT_STATUS.PROCESSED, PAYOUT_EVENT_STATUS.IGNORED].includes(
    eventDoc.processingStatus,
  );
}

async function claimEvent(eventDoc) {
  const now = new Date();
  const claimed = await PayoutEvent.findOneAndUpdate(
    {
      _id: eventDoc._id,
      $or: [
        {
          processingStatus: {
            $in: [PAYOUT_EVENT_STATUS.RECEIVED, PAYOUT_EVENT_STATUS.FAILED],
          },
        },
        {
          processingStatus: PAYOUT_EVENT_STATUS.PROCESSING,
          processingStartedAt: {
            $lt: new Date(now.getTime() - PAYOUT_CONFIG.EVENT_LEASE_MS),
          },
        },
      ],
    },
    {
      $set: {
        processingStatus: PAYOUT_EVENT_STATUS.PROCESSING,
        processingStartedAt: now,
        errorMessage: null,
      },
      $inc: { processingAttempts: 1 },
    },
    { new: true },
  );
  if (!claimed) {
    const error = new Error(PAYOUT_MESSAGE.EVENT_ALREADY_PROCESSING);
    error.statusCode = PAYOUT_HTTP_STATUS.SERVICE_UNAVAILABLE;
    throw error;
  }
  return claimed;
}

async function processClaimedEvent({
  claimed,
  providerName,
  source,
  normalized,
}) {
  if (normalized.isBatchEvent) {
    const queued = await queueCashfreeBatchReconciliation(normalized);
    if (!queued) {
      return ignoreEvent(
        claimed,
        PAYOUT_MESSAGE.WITHDRAWAL_NOT_FOUND_FOR_REFERENCE,
      );
    }
    await PayoutEvent.updateOne(
      { _id: claimed._id },
      {
        $set: {
          processingStatus: PAYOUT_EVENT_STATUS.PROCESSED,
          result: PAYOUT_MESSAGE.PAYOUT_BATCH_RECONCILIATION_QUEUED,
          processedAt: new Date(),
        },
      },
    );
    return {
      status: PAYOUT_RESULT.SUCCESS,
      processed: true,
      batchReconciliationQueued: true,
    };
  }

  if (normalized.isTransferEvent === false) {
    if (normalized.eventType === CASHFREE_PAYOUT_EVENT.BENEFICIARY_INCIDENT) {
      logger.warn(PAYOUT_MESSAGE.BENEFICIARY_INCIDENT_LOG, {
        provider: providerName,
        eventId: claimed.providerEventId || claimed.dedupeKey,
        payload: normalized.safePayload,
      });
    }
    return ignoreEvent(claimed, PAYOUT_MESSAGE.NON_TRANSFER_EVENT_IGNORED);
  }

  if (!normalized.providerReferenceId && !normalized.providerTransferId) {
    return ignoreEvent(claimed, PAYOUT_MESSAGE.TRANSFER_IDENTITY_MISSING);
  }

  const withdrawal = await findWithdrawal(providerName, normalized);
  if (!withdrawal) {
    return ignoreEvent(
      claimed,
      PAYOUT_MESSAGE.WITHDRAWAL_NOT_FOUND_FOR_REFERENCE,
    );
  }

  validateWithdrawalIdentity(withdrawal, normalized);
  const result = await applyTransferUpdate({
    withdrawal,
    provider: providerName,
    normalized,
    eventDoc: claimed,
    source: getLedgerSource(source),
  });
  return result;
}

function findWithdrawal(providerName, normalized) {
  return Withdrawal.findOne({
    payoutProvider: providerName,
    $or: [
      ...(normalized.providerReferenceId
        ? [{ providerReferenceId: normalized.providerReferenceId }]
        : []),
      ...(normalized.providerTransferId
        ? [{ providerTransferId: normalized.providerTransferId }]
        : []),
    ],
  }).lean();
}

function validateWithdrawalIdentity(withdrawal, normalized) {
  if (
    normalized.providerReferenceId &&
    normalized.providerReferenceId !== withdrawal.providerReferenceId
  ) {
    throw new Error(PAYOUT_MESSAGE.PROVIDER_REFERENCE_MISMATCH);
  }
  if (
    normalized.providerTransferId &&
    withdrawal.providerTransferId &&
    normalized.providerTransferId !== withdrawal.providerTransferId
  ) {
    throw new Error(PAYOUT_MESSAGE.PROVIDER_TRANSFER_ID_MISMATCH);
  }
}

function getLedgerSource(source) {
  return source === PAYOUT_SOURCE.WEBHOOK
    ? PAYOUT_SOURCE.PAYOUT_WEBHOOK
    : PAYOUT_SOURCE.PAYOUT_RECONCILIATION;
}

async function ignoreEvent(eventDoc, reason) {
  await PayoutEvent.updateOne(
    { _id: eventDoc._id },
    {
      $set: {
        processingStatus: PAYOUT_EVENT_STATUS.IGNORED,
        result: reason,
        processedAt: new Date(),
      },
    },
  );
  return { status: PAYOUT_RESULT.IGNORED, reason };
}

async function markEventFailed(eventDoc, error) {
  await PayoutEvent.updateOne(
    { _id: eventDoc._id, processingStatus: PAYOUT_EVENT_STATUS.PROCESSING },
    {
      $set: {
        processingStatus: PAYOUT_EVENT_STATUS.FAILED,
        errorMessage: safeText(error.message),
      },
    },
  );
}

async function processWebhook(headers = {}, rawBody, body, options = {}) {
  try {
    return await processWebhookInternal(headers, rawBody, body, options);
  } catch (error) {
    const statusCode =
      error.statusCode || PAYOUT_HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const message =
      statusCode >= PAYOUT_HTTP_STATUS.INTERNAL_SERVER_ERROR
        ? PAYOUT_MESSAGE.WEBHOOK_RETRY
        : safeText(error.message);
    sendFailResponse(message || PAYOUT_MESSAGE.WEBHOOK_FAILURE, statusCode);
  }
}

module.exports = { processWebhook, verifySignature };

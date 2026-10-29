const crypto = require("crypto");
const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");
const {
  PAYOUT_PROVIDER,
  PAYOUT_EVENT_STATUS,
  PAYOUT_SOURCE,
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
  PAYOUT_RESULT,
  PAYOUT_HTTP_STATUS,
} = require("../../constants/payouts");
const {
  APP_NOTIFICATIONS,
  getNotification,
} = require("../../constants/notifications");
const Withdrawal = require("../../schemas/withdrawal.schema");
const PayoutEvent = require("../../schemas/payout-event.schema");
const User = require("../../schemas/user.schema");
const { sendFcmNotifications } = require("../../functions/fcm");
const { formatNotification } = require("../../utils/heplers");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { getProvider, currentProviderName } = require("../../functions/payouts");
const {
  applyTransferUpdate,
  safeText,
} = require("../withdrawals/payout-state.service");
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
  const eventDoc = await PayoutEvent.findOneAndUpdate(
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
  if (
    [PAYOUT_EVENT_STATUS.PROCESSED, PAYOUT_EVENT_STATUS.IGNORED].includes(
      eventDoc.processingStatus,
    )
  )
    return { status: PAYOUT_RESULT.SUCCESS, processed: false, duplicate: true };
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

  try {
    if (!normalized.providerReferenceId && !normalized.providerTransferId) {
      await PayoutEvent.updateOne(
        { _id: claimed._id },
        {
          $set: {
            processingStatus: PAYOUT_EVENT_STATUS.IGNORED,
            result: PAYOUT_MESSAGE.TRANSFER_IDENTITY_MISSING,
            processedAt: new Date(),
          },
        },
      );
      return {
        status: PAYOUT_RESULT.IGNORED,
        reason: PAYOUT_MESSAGE.TRANSFER_IDENTITY_MISSING,
      };
    }
    const withdrawal = await Withdrawal.findOne({
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
    if (!withdrawal) {
      await PayoutEvent.updateOne(
        { _id: claimed._id },
        {
          $set: {
            processingStatus: PAYOUT_EVENT_STATUS.IGNORED,
            result: PAYOUT_MESSAGE.WITHDRAWAL_NOT_FOUND_FOR_REFERENCE,
            processedAt: new Date(),
          },
        },
      );
      return {
        status: PAYOUT_RESULT.IGNORED,
        reason: PAYOUT_MESSAGE.WITHDRAWAL_NOT_FOUND_FOR_REFERENCE,
      };
    }
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
    const result = await applyTransferUpdate({
      withdrawal,
      provider: providerName,
      normalized,
      eventDoc: claimed,
      source:
        source === PAYOUT_SOURCE.WEBHOOK
          ? PAYOUT_SOURCE.PAYOUT_WEBHOOK
          : PAYOUT_SOURCE.PAYOUT_RECONCILIATION,
    });
    if (
      result.processed &&
      [
        WITHDRAWAL_STATUS.COMPLETED,
        WITHDRAWAL_STATUS.FAILED,
        WITHDRAWAL_STATUS.REVERSED,
      ].includes(normalized.targetStatus)
    ) {
      const user = await User.findById(withdrawal.userId).lean();
      if (user?.fcmTokens?.length && user.enableNotification) {
        const success = normalized.targetStatus === WITHDRAWAL_STATUS.COMPLETED;
        const localized = getNotification(
          APP_NOTIFICATIONS.withdraw[success ? "success" : "failed"],
          user.language,
        );
        const message = success
          ? formatNotification(localized.body, {
              amount: withdrawal.cashAmount,
            })
          : localized.body;
        sendFcmNotifications(user.fcmTokens, localized.title, message).catch(
          (error) =>
            logger.error(PAYOUT_MESSAGE.FCM_NOTIFICATION_LOG, {
              withdrawalId: String(withdrawal._id),
              error: safeText(error.message),
            }),
        );
      }
    }
    return result;
  } catch (error) {
    await PayoutEvent.updateOne(
      { _id: claimed._id, processingStatus: PAYOUT_EVENT_STATUS.PROCESSING },
      {
        $set: {
          processingStatus: PAYOUT_EVENT_STATUS.FAILED,
          errorMessage: safeText(error.message),
        },
      },
    );
    logger.error(PAYOUT_MESSAGE.WEBHOOK_PROCESSING_FAILED, {
      provider: providerName,
      eventId: providerEventId || dedupeKey,
      error: safeText(error.message),
    });
    throw error;
  }
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

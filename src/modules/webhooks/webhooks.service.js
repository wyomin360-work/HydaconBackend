const crypto = require("crypto");
const mongoose = require("mongoose");
const Withdrawal = require("../../schemas/withdrawal.schema");
const User = require("../../schemas/user.schema");
const LedgerEntry = require("../../schemas/ledger-entry.schema");
const PayoutEvent = require("../../schemas/payout-event.schema");
const { sendFcmNotifications } = require("../../functions/fcm");
const {
  APP_NOTIFICATIONS,
  getNotification,
} = require("../../constants/notifications");
const { formatNotification } = require("../../utils/heplers");
const logger = require("../../config/pino.config");
const {
  verifyPayoutWebhook,
  getPayoutWebhookDeliveryId,
} = require("../../functions/razorpayx");

const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "REVERSED", "CANCELLED"];
const EVENT_LEASE_MS = 10 * 60 * 1000;

function redactProviderText(value, maxLength = 500) {
  return String(value)
    .replace(/\d{6,}/g, "[redacted]")
    .slice(0, maxLength);
}

function verifySignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || !signature || !secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const received = Buffer.from(String(signature), "ascii");
  const expectedBuffer = Buffer.from(expected, "ascii");
  return (
    received.length === expectedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, received)
  );
}

function signatureError(message) {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

function getTargetStatus(event, entity) {
  switch (event) {
    case "payout.processed":
      return "COMPLETED";
    case "payout.failed":
    case "payout.rejected":
    case "payout.cancelled":
      return "FAILED";
    case "payout.reversed":
      return "REVERSED";
    case "payout.queued":
    case "payout.pending":
    case "payout.initiated":
    case "payout.updated":
      if (entity.status === "processed") return "COMPLETED";
      if (entity.status === "reversed") return "REVERSED";
      if (["failed", "rejected", "cancelled"].includes(entity.status))
        return "FAILED";
      return "PROCESSING";
    default:
      return null;
  }
}

function safeWebhookPayload(event, payout) {
  const safe = { event };
  if (!payout) return safe;
  for (const field of [
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
  ]) {
    if (payout[field] !== undefined && payout[field] !== null) {
      safe[field] =
        typeof payout[field] === "string"
          ? (field === "failure_reason"
              ? redactProviderText(payout[field])
              : payout[field]
            ).slice(0, 500)
          : payout[field];
    }
  }
  return safe;
}

async function recordIgnoredEvent(eventDoc, reason, details = {}) {
  await PayoutEvent.updateOne(
    { _id: eventDoc._id, processingStatus: "PROCESSING" },
    {
      $set: {
        processingStatus: "IGNORED",
        result: reason,
        ...details,
        processedAt: new Date(),
      },
    },
  );
  logger.warn("Payout webhook ignored", {
    eventId: eventDoc.providerEventId || eventDoc.dedupeKey,
    eventType: eventDoc.eventType,
    payoutId: eventDoc.payoutId,
    reason,
  });
  return { status: "ignored", reason };
}

async function recordPayoutAnomaly(eventDoc, reason, details = {}) {
  await PayoutEvent.updateOne(
    { _id: eventDoc._id, processingStatus: "PROCESSING" },
    {
      $set: {
        processingStatus: "IGNORED",
        result: `payout-anomaly:${reason}`,
        ...details,
        processedAt: new Date(),
      },
    },
  );
  logger.error("Payout webhook failed consistency checks", {
    eventId: eventDoc.providerEventId || eventDoc.dedupeKey,
    eventType: eventDoc.eventType,
    payoutId: eventDoc.payoutId,
    reason,
  });
  return { status: "ignored", reason };
}

async function processWebhook(headers, rawBody, body, options = {}) {
  const deliverySource = options.source || "WEBHOOK";
  if (deliverySource === "WEBHOOK") {
    verifyPayoutWebhook(headers, rawBody);
  }

  if (!Buffer.isBuffer(rawBody))
    throw signatureError("Webhook raw body is unavailable");
  const eventType = typeof body?.event === "string" ? body.event : "unknown";
  const payout = body?.payload?.payout?.entity || null;
  const providerEventId =
    deliverySource === "WEBHOOK" ? getPayoutWebhookDeliveryId(headers) : null;
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const dedupeKey = `${deliverySource.toLowerCase()}:sha256:${payloadHash}`;
  const safePayload = safeWebhookPayload(eventType, payout);
  const eventDoc = await PayoutEvent.findOneAndUpdate(
    { dedupeKey },
    {
      $setOnInsert: {
        dedupeKey,
        providerEventId,
        eventType,
        deliverySource,
        payoutId: payout?.id || null,
        referenceId: payout?.reference_id || null,
        providerStatus: payout?.status || null,
        payloadHash,
        safePayload,
        processingStatus: "RECEIVED",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (["PROCESSED", "IGNORED"].includes(eventDoc.processingStatus)) {
    return { status: "success", processed: false, duplicate: true };
  }

  const claimBefore = new Date(Date.now() - EVENT_LEASE_MS);
  const claimedEvent = await PayoutEvent.findOneAndUpdate(
    {
      _id: eventDoc._id,
      $or: [
        { processingStatus: { $in: ["RECEIVED", "FAILED"] } },
        {
          processingStatus: "PROCESSING",
          processingStartedAt: { $lt: claimBefore },
        },
      ],
    },
    {
      $set: {
        processingStatus: "PROCESSING",
        processingStartedAt: new Date(),
        errorMessage: null,
      },
      $inc: { processingAttempts: 1 },
    },
    { new: true },
  );
  if (!claimedEvent) {
    const retryError = new Error("Webhook event is already being processed");
    retryError.statusCode = 503;
    throw retryError;
  }

  if (
    !payout ||
    typeof eventType !== "string" ||
    !body?.payload?.payout?.entity
  ) {
    return recordIgnoredEvent(claimedEvent, "invalid or non-payout payload");
  }
  const payoutId = payout.id;
  const referenceId = payout.reference_id;
  if (!payoutId) return recordIgnoredEvent(claimedEvent, "payout id missing");
  const targetStatus = getTargetStatus(eventType, payout);
  if (!targetStatus)
    return recordIgnoredEvent(claimedEvent, "unsupported event");

  let withdrawal;
  try {
    withdrawal =
      referenceId && mongoose.Types.ObjectId.isValid(referenceId)
        ? await Withdrawal.findOne({ _id: referenceId })
        : await Withdrawal.findOne({ providerPayoutId: payoutId });
  } catch (error) {
    await PayoutEvent.updateOne(
      { _id: claimedEvent._id, processingStatus: "PROCESSING" },
      {
        $set: {
          processingStatus: "FAILED",
          errorMessage: redactProviderText(error.message),
        },
      },
    );
    logger.error("Payout webhook withdrawal lookup failed", {
      eventId: claimedEvent.providerEventId || claimedEvent.dedupeKey,
      payoutId,
      error: redactProviderText(error.message),
    });
    throw error;
  }
  if (!withdrawal) {
    return recordIgnoredEvent(claimedEvent, "withdrawal not found");
  }
  if (referenceId && referenceId !== String(withdrawal._id)) {
    return recordPayoutAnomaly(
      claimedEvent,
      "reference ID does not match withdrawal",
    );
  }
  if (withdrawal.providerPayoutId && withdrawal.providerPayoutId !== payoutId) {
    return recordPayoutAnomaly(
      claimedEvent,
      "payout ID does not match withdrawal",
    );
  }
  const expectedAmount = Math.round(withdrawal.cashAmount * 100);
  if (payout.amount != null && Number(payout.amount) !== expectedAmount) {
    return recordPayoutAnomaly(
      claimedEvent,
      "payout amount does not match withdrawal",
      {
        result: `payout-anomaly:amount-mismatch:expected-${expectedAmount}`,
      },
    );
  }
  if (payout.currency && payout.currency !== "INR") {
    return recordPayoutAnomaly(claimedEvent, "payout currency is not INR");
  }

  const session = await mongoose.startSession();
  let applied = false;
  try {
    await session.withTransaction(async () => {
      applied = false;
      const result = await Withdrawal.updateOne(
        { _id: withdrawal._id, status: { $nin: TERMINAL_STATUSES } },
        {
          $set: {
            status: targetStatus,
            providerPayoutId: payoutId,
            ...(targetStatus === "COMPLETED"
              ? {
                  completedAt: new Date(),
                  ...(payout.utr ? { utr: payout.utr } : {}),
                }
              : {}),
            ...(["FAILED", "REVERSED"].includes(targetStatus)
              ? {
                  failureReason:
                    (payout.failure_reason &&
                      redactProviderText(payout.failure_reason)) ||
                    `Payout ${targetStatus.toLowerCase()}`,
                }
              : {}),
          },
        },
        { session },
      );

      if (result.modifiedCount && targetStatus === "COMPLETED") {
        const userBefore = await User.findOneAndUpdate(
          { _id: withdrawal.userId },
          { $inc: { totalWithdraw: withdrawal.cashAmount } },
          { new: false, session },
        );
        if (!userBefore) throw new Error("Withdrawal user not found");
        await LedgerEntry.create(
          [
            {
              entryKey: `withdrawal:${withdrawal._id}:payout-completed`,
              userId: withdrawal.userId,
              withdrawalId: withdrawal._id,
              payoutId,
              movement: "PAYOUT_COMPLETED",
              asset: "INR",
              amount: withdrawal.cashAmount,
              balanceBefore: userBefore.totalWithdraw || 0,
              balanceAfter:
                (userBefore.totalWithdraw || 0) + withdrawal.cashAmount,
              source:
                deliverySource === "WEBHOOK"
                  ? "PAYOUT_WEBHOOK"
                  : "PAYOUT_RECONCILIATION",
              sourceId: claimedEvent.providerEventId || claimedEvent.dedupeKey,
              metadata: { eventType, utr: payout.utr || null },
            },
          ],
          { session },
        );
        applied = true;
      } else if (
        result.modifiedCount &&
        ["FAILED", "REVERSED"].includes(targetStatus)
      ) {
        const userBefore = await User.findOneAndUpdate(
          { _id: withdrawal.userId },
          { $inc: { hydaconCoins: withdrawal.coinAmount } },
          { new: false, session },
        );
        if (!userBefore) throw new Error("Withdrawal user not found");
        await LedgerEntry.create(
          [
            {
              entryKey: `withdrawal:${withdrawal._id}:coin-refund:${targetStatus.toLowerCase()}`,
              userId: withdrawal.userId,
              withdrawalId: withdrawal._id,
              payoutId,
              movement: "WITHDRAWAL_COIN_REFUND",
              asset: "HYDACON_COIN",
              amount: withdrawal.coinAmount,
              balanceBefore: userBefore.hydaconCoins || 0,
              balanceAfter:
                (userBefore.hydaconCoins || 0) + withdrawal.coinAmount,
              source:
                deliverySource === "WEBHOOK"
                  ? "PAYOUT_WEBHOOK"
                  : "PAYOUT_RECONCILIATION",
              sourceId: claimedEvent.providerEventId || claimedEvent.dedupeKey,
              metadata: {
                eventType,
                failureReason: payout.failure_reason
                  ? redactProviderText(payout.failure_reason)
                  : null,
              },
            },
          ],
          { session },
        );
        applied = true;
      }

      await PayoutEvent.updateOne(
        { _id: claimedEvent._id, processingStatus: "PROCESSING" },
        {
          $set: {
            processingStatus: "PROCESSED",
            result: applied
              ? `applied:${targetStatus}`
              : `duplicate-or-terminal:${targetStatus}`,
            processedAt: new Date(),
            errorMessage: null,
          },
        },
        { session },
      );
    });
  } catch (error) {
    logger.error("Payout webhook processing failed", {
      eventId: claimedEvent.providerEventId || claimedEvent.dedupeKey,
      eventType,
      payoutId,
      withdrawalId: String(withdrawal._id),
      error: redactProviderText(error.message),
    });
    try {
      await PayoutEvent.updateOne(
        { _id: claimedEvent._id, processingStatus: "PROCESSING" },
        {
          $set: {
            processingStatus: "FAILED",
            errorMessage: redactProviderText(error.message),
          },
        },
      );
    } catch (auditError) {
      logger.error("Failed to persist Payout webhook processing error", {
        eventId: claimedEvent.providerEventId || claimedEvent.dedupeKey,
        error: auditError.message,
      });
    }
    throw error;
  } finally {
    await session.endSession();
  }

  logger.info("Payout webhook processed", {
    eventId: claimedEvent.providerEventId || claimedEvent.dedupeKey,
    eventType,
    deliverySource,
    payoutId,
    withdrawalId: String(withdrawal._id),
    targetStatus,
    applied,
  });

  if (applied && ["COMPLETED", "FAILED", "REVERSED"].includes(targetStatus)) {
    const user = await User.findById(withdrawal.userId);
    if (user?.fcmTokens?.length && user.enableNotification) {
      const notificationKey =
        targetStatus === "COMPLETED" ? "success" : "failed";
      const localized = getNotification(
        APP_NOTIFICATIONS.withdraw[notificationKey],
        user.language,
      );
      const message =
        targetStatus === "COMPLETED"
          ? formatNotification(localized.body, {
              amount: withdrawal.cashAmount,
            })
          : localized.body;
      sendFcmNotifications(user.fcmTokens, localized.title, message).catch(
        (error) =>
          logger.error("FCM withdrawal webhook notification failed", {
            withdrawalId: String(withdrawal._id),
            error: error.message,
          }),
      );
    }
  }

  return {
    status: "success",
    processed: applied,
    duplicateOrTerminal: !applied,
  };
}

module.exports = { processWebhook, verifySignature, getTargetStatus };

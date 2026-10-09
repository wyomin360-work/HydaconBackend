const crypto = require("crypto");
const mongoose = require("mongoose");
const Withdrawal = require("../../schemas/withdrawal.schema");
const User = require("../../schemas/user.schema");
const { sendFcmNotifications } = require("../../functions/fcm");
const {
  APP_NOTIFICATIONS,
  getNotification,
} = require("../../constants/notifications");
const { formatNotification } = require("../../utils/heplers");

const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "REVERSED", "CANCELLED"];

function verifySignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || !signature || !secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const receivedBuffer = Buffer.from(String(signature), "ascii");
  const expectedBuffer = Buffer.from(expected, "ascii");
  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
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

async function processWebhook(headers, rawBody, body) {
  const secret = process.env.RAZORPAYX_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw signatureError("RazorpayX webhook secret is not configured");
    }
    console.warn(
      "RazorpayX webhook signature verification bypassed outside production",
    );
  } else if (
    !verifySignature(rawBody, headers["x-razorpay-signature"], secret)
  ) {
    throw signatureError("Invalid webhook signature");
  }

  if (
    !body ||
    typeof body.event !== "string" ||
    !body.payload?.payout?.entity
  ) {
    return { status: "ignored", reason: "invalid or non-payout payload" };
  }
  const { event, payload } = body;
  const payout = payload.payout.entity;
  const payoutId = payout.id;
  const referenceId = payout.reference_id;
  if (!payoutId) return { status: "ignored", reason: "payout id missing" };

  const targetStatus = getTargetStatus(event, payout);
  if (!targetStatus) return { status: "ignored", reason: "unsupported event" };

  const lookup = [];
  if (referenceId && mongoose.Types.ObjectId.isValid(referenceId))
    lookup.push({ _id: referenceId });
  lookup.push({ razorpayPayoutId: payoutId });
  const withdrawal = await Withdrawal.findOne({ $or: lookup });
  if (!withdrawal) {
    // Acknowledge unknown payouts to stop retries; the warning allows operational follow-up.
    console.error(
      `RazorpayX payout webhook has no matching withdrawal: ${payoutId}`,
    );
    return { status: "ignored", reason: "withdrawal not found" };
  }

  const session = await mongoose.startSession();
  let applied = false;
  try {
    await session.withTransaction(async () => {
      applied = false;
      const filter = {
        _id: withdrawal._id,
        status: { $nin: TERMINAL_STATUSES },
      };
      // A late non-terminal event must never regress a terminal state.
      if (targetStatus === "PROCESSING")
        filter.status = { $nin: TERMINAL_STATUSES };
      const update = { $set: { status: targetStatus } };
      if (payoutId) update.$set.razorpayPayoutId = payoutId;
      if (targetStatus === "COMPLETED") {
        update.$set.completedAt = new Date();
        if (payout.utr) update.$set.utr = payout.utr;
      }
      if (["FAILED", "REVERSED"].includes(targetStatus)) {
        update.$set.failureReason =
          payout.failure_reason || `Payout ${targetStatus.toLowerCase()}`;
      }

      const result = await Withdrawal.updateOne(filter, update, { session });
      if (!result.modifiedCount) return;
      applied = true;

      if (targetStatus === "COMPLETED") {
        const userUpdate = await User.updateOne(
          { _id: withdrawal.userId },
          { $inc: { totalWithdraw: withdrawal.cashAmount } },
          { session },
        );
        if (!userUpdate.matchedCount)
          throw new Error("Withdrawal user not found");
      } else if (["FAILED", "REVERSED"].includes(targetStatus)) {
        const userUpdate = await User.updateOne(
          { _id: withdrawal.userId },
          { $inc: { hydaconCoins: withdrawal.coinAmount } },
          { session },
        );
        if (!userUpdate.matchedCount)
          throw new Error("Withdrawal user not found");
      }
    });
  } finally {
    await session.endSession();
  }

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
          console.error("[FCM] Withdrawal webhook notification failed:", error),
      );
    }
  }

  return {
    status: "success",
    processed: applied,
    duplicateOrTerminal: !applied,
  };
}

module.exports = { processWebhook, verifySignature };

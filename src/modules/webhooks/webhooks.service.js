const crypto = require("crypto");
const mongoose = require("mongoose");
const Withdrawal = require("../../schemas/withdrawal.schema");
const User = require("../../schemas/user.schema");
const { sendFcmNotifications } = require("../../functions/fcm");
const { APP_NOTIFICATIONS, getNotification } = require("../../constants/notifications");
const { formatNotification } = require("../../utils/heplers");

/**
 * Verify webhook signature using HMAC SHA256.
 */
function verifySignature(rawBody, signature, secret) {
  if (!secret) return true; // If no secret is configured, skip verification (useful for dev/test)
  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody);
  const digest = hmac.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest, "ascii"), Buffer.from(signature, "ascii"));
}

/**
 * Process RazorpayX webhook event.
 */
async function processWebhook(headers, rawBody, body) {
  const signature = headers["x-razorpay-signature"];
  const secret = process.env.RAZORPAYX_WEBHOOK_SECRET;

  if (secret) {
    if (!verifySignature(rawBody, signature, secret)) {
      throw new Error("Invalid webhook signature");
    }
  } else {
    console.warn("⚠️ RAZORPAYX_WEBHOOK_SECRET is not configured. Webhook signature verification was bypassed.");
  }

  const { event, payload } = body;
  if (!payload || !payload.payout || !payload.payout.entity) {
    console.log("Ignored non-payout webhook event:", event);
    return { status: "ignored", reason: "no payout entity" };
  }

  const payoutEntity = payload.payout.entity;
  const payoutId = payoutEntity.id;
  const referenceId = payoutEntity.reference_id; // Matches withdrawal _id

  // Find the withdrawal request
  let withdrawal;
  if (mongoose.Types.ObjectId.isValid(referenceId)) {
    withdrawal = await Withdrawal.findById(referenceId).populate("userId");
  }

  if (!withdrawal) {
    withdrawal = await Withdrawal.findOne({ razorpayPayoutId: payoutId }).populate("userId");
  }

  if (!withdrawal) {
    console.error(`Withdrawal not found for webhook reference_id: ${referenceId}, payout_id: ${payoutId}`);
    return { status: "error", reason: "withdrawal not found" };
  }

  const user = withdrawal.userId;
  if (!user) {
    console.error(`User not found for withdrawal: ${withdrawal._id}`);
    return { status: "error", reason: "user not found" };
  }

  console.log(`Processing Webhook Event: ${event} for Withdrawal: ${withdrawal._id}`);

  // Prevent processing if status is already in terminal states (COMPLETED, CANCELLED)
  if (["COMPLETED", "CANCELLED"].includes(withdrawal.status)) {
    console.log(`Withdrawal ${withdrawal._id} is already in terminal status: ${withdrawal.status}`);
    return { status: "success", info: "already completed/cancelled" };
  }

  switch (event) {
    case "payout.initiated":
    case "transaction.created":
      // Payout is processing
      if (withdrawal.status !== "PROCESSING") {
        withdrawal.status = "PROCESSING";
        if (!withdrawal.razorpayPayoutId) {
          withdrawal.razorpayPayoutId = payoutId;
        }
        await withdrawal.save();
      }
      break;

    case "payout.processed": {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          withdrawal.status = "COMPLETED";
          withdrawal.utr = payoutEntity.utr || withdrawal.utr;
          withdrawal.completedAt = new Date();
          await withdrawal.save({ session });

          // Add to user's total withdraw cash amount
          user.totalWithdraw = (user.totalWithdraw || 0) + withdrawal.cashAmount;
          await user.save({ session });
        });

        // Send FCM notification
        if (user.fcmTokens?.length && user.enableNotification) {
          const localizedNotif = getNotification(APP_NOTIFICATIONS.withdraw.success, user.language);
          sendFcmNotifications(
            user.fcmTokens,
            localizedNotif.title,
            formatNotification(localizedNotif.body, { amount: withdrawal.cashAmount })
          ).catch((err) => console.error("[FCM] Webhook processed notification failed:", err));
        }
      } catch (err) {
        console.error("Failed to commit payout.processed transaction:", err);
        throw err;
      } finally {
        await session.endSession();
      }
      break;
    }

    case "payout.failed": {
      const failureReason = payoutEntity.failure_reason || "Payout failed";
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          withdrawal.status = "FAILED";
          withdrawal.failureReason = failureReason;
          await withdrawal.save({ session });

          // Refund coins back to user
          user.hydaconCoins = (user.hydaconCoins || 0) + withdrawal.coinAmount;
          await user.save({ session });
        });

        // Send FCM notification
        if (user.fcmTokens?.length && user.enableNotification) {
          const localizedNotif = getNotification(APP_NOTIFICATIONS.withdraw.failed, user.language);
          sendFcmNotifications(
            user.fcmTokens,
            localizedNotif.title,
            localizedNotif.body
          ).catch((err) => console.error("[FCM] Webhook failed notification failed:", err));
        }
      } catch (err) {
        console.error("Failed to commit payout.failed transaction:", err);
        throw err;
      } finally {
        await session.endSession();
      }
      break;
    }

    case "payout.reversed": {
      const failureReason = payoutEntity.failure_reason || "Payout reversed by bank";
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          withdrawal.status = "REVERSED";
          withdrawal.failureReason = failureReason;
          await withdrawal.save({ session });

          // Refund coins back to user
          user.hydaconCoins = (user.hydaconCoins || 0) + withdrawal.coinAmount;
          await user.save({ session });
        });

        // Send FCM notification (custom reversed message if configured, else fall back to failed)
        if (user.fcmTokens?.length && user.enableNotification) {
          const withdrawNotification = APP_NOTIFICATIONS.withdraw;
          // Use custom reversed notification if defined, otherwise fall back to failed
          const reversedNotif = withdrawNotification.reversed || withdrawNotification.failed;
          const localizedNotif = getNotification(reversedNotif, user.language);
          sendFcmNotifications(
            user.fcmTokens,
            localizedNotif.title,
            formatNotification(localizedNotif.body, { amount: withdrawal.cashAmount })
          ).catch((err) => console.error("[FCM] Webhook reversed notification failed:", err));
        }
      } catch (err) {
        console.error("Failed to commit payout.reversed transaction:", err);
        throw err;
      } finally {
        await session.endSession();
      }
      break;
    }

    default:
      console.log("Unhandled webhook event type:", event);
  }

  return { status: "success", processed: true };
}

module.exports = {
  processWebhook,
};

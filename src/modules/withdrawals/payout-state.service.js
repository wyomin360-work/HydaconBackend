const mongoose = require("mongoose");
const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");
const {
  PAYOUT_EVENT_STATUS,
  PAYOUT_CURRENCY,
  PAYOUT_ASSET,
  PAYOUT_LEDGER_MOVEMENT,
  PAYOUT_SOURCE,
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
  PAYOUT_RESULT,
  PAYOUT_TERMINAL_WITHDRAWAL_STATUSES,
  PAYOUT_FAILURE_TERMINAL_STATUSES,
} = require("../../constants/payouts");
const Withdrawal = require("../../schemas/withdrawal.schema");
const User = require("../../schemas/user.schema");
const LedgerEntry = require("../../schemas/ledger-entry.schema");
const PayoutEvent = require("../../schemas/payout-event.schema");
const logger = require("../../config/pino.config");

function safeText(value, maxLength = PAYOUT_CONFIG.MAX_ERROR_LENGTH) {
  return String(value || "")
    .replace(
      new RegExp(`\\d{${PAYOUT_CONFIG.REDACT_DIGIT_SEQUENCE_LENGTH},}`, "g"),
      "[redacted]",
    )
    .slice(0, maxLength);
}

function canApplyPayoutStatus(currentStatus, targetStatus) {
  switch (targetStatus) {
    case WITHDRAWAL_STATUS.PROCESSING:
      return !PAYOUT_TERMINAL_WITHDRAWAL_STATUSES.includes(currentStatus);
    case WITHDRAWAL_STATUS.COMPLETED:
      return (
        !PAYOUT_FAILURE_TERMINAL_STATUSES.includes(currentStatus) &&
        currentStatus !== WITHDRAWAL_STATUS.COMPLETED
      );
    case WITHDRAWAL_STATUS.REVERSED:
      return (
        currentStatus !== WITHDRAWAL_STATUS.REVERSED &&
        currentStatus !== WITHDRAWAL_STATUS.FAILED &&
        currentStatus !== WITHDRAWAL_STATUS.CANCELLED
      );
    case WITHDRAWAL_STATUS.FAILED:
      return (
        currentStatus !== WITHDRAWAL_STATUS.COMPLETED &&
        currentStatus !== WITHDRAWAL_STATUS.REVERSED &&
        currentStatus !== WITHDRAWAL_STATUS.FAILED &&
        currentStatus !== WITHDRAWAL_STATUS.CANCELLED
      );
    default:
      return false;
  }
}

async function applyTransferUpdate({
  withdrawal,
  provider,
  normalized,
  eventDoc = null,
  source = PAYOUT_SOURCE.PAYOUT_RECONCILIATION,
}) {
  if (!normalized.targetStatus) {
    if (eventDoc) {
      await PayoutEvent.updateOne(
        { _id: eventDoc._id, processingStatus: PAYOUT_EVENT_STATUS.PROCESSING },
        {
          $set: {
            processingStatus: PAYOUT_EVENT_STATUS.IGNORED,
            result: PAYOUT_MESSAGE.UNSUPPORTED_PROVIDER_STATUS,
            processedAt: new Date(),
          },
        },
      );
    }
    return {
      status: PAYOUT_RESULT.IGNORED,
      reason: PAYOUT_MESSAGE.UNSUPPORTED_PROVIDER_STATUS,
    };
  }

  const expectedMinor = Math.round(
    Number(withdrawal.cashAmount) * PAYOUT_CONFIG.MINOR_UNITS_PER_INR,
  );
  if (
    normalized.amountMinor != null &&
    Number(normalized.amountMinor) !== expectedMinor
  ) {
    logger.error(PAYOUT_MESSAGE.AMOUNT_MISMATCH_LOG, {
      withdrawalId: String(withdrawal._id),
      provider,
      providerTransferId: normalized.providerTransferId,
      expectedMinor,
      actualMinor: normalized.amountMinor,
    });
    if (eventDoc) {
      await PayoutEvent.updateOne(
        { _id: eventDoc._id, processingStatus: PAYOUT_EVENT_STATUS.PROCESSING },
        {
          $set: {
            processingStatus: PAYOUT_EVENT_STATUS.IGNORED,
            result: PAYOUT_MESSAGE.AMOUNT_MISMATCH,
            processedAt: new Date(),
          },
        },
      );
    }
    return {
      status: PAYOUT_RESULT.IGNORED,
      reason: PAYOUT_MESSAGE.AMOUNT_MISMATCH,
    };
  }
  if (normalized.currency && normalized.currency !== PAYOUT_CURRENCY.INR) {
    if (eventDoc) {
      await PayoutEvent.updateOne(
        { _id: eventDoc._id, processingStatus: PAYOUT_EVENT_STATUS.PROCESSING },
        {
          $set: {
            processingStatus: PAYOUT_EVENT_STATUS.IGNORED,
            result: PAYOUT_MESSAGE.CURRENCY_MISMATCH,
            processedAt: new Date(),
          },
        },
      );
    }
    return {
      status: PAYOUT_RESULT.IGNORED,
      reason: PAYOUT_MESSAGE.CURRENCY_MISMATCH,
    };
  }

  const targetStatus = normalized.targetStatus;
  const session = await mongoose.startSession();
  let applied = false;
  let finalStatus = null;
  try {
    await session.withTransaction(async () => {
      const current = await Withdrawal.findById(withdrawal._id)
        .session(session)
        .lean();
      if (!current) throw new Error(PAYOUT_MESSAGE.WITHDRAWAL_NOT_FOUND);

      const alreadyCompleted = current.status === WITHDRAWAL_STATUS.COMPLETED;
      const alreadyFailed = current.status === WITHDRAWAL_STATUS.FAILED;
      const alreadyReversed = current.status === WITHDRAWAL_STATUS.REVERSED;
      const canApply = canApplyPayoutStatus(current.status, targetStatus);

      if (!canApply) {
        if (eventDoc) {
          await PayoutEvent.updateOne(
            {
              _id: eventDoc._id,
              processingStatus: PAYOUT_EVENT_STATUS.PROCESSING,
            },
            {
              $set: {
                processingStatus: PAYOUT_EVENT_STATUS.PROCESSED,
                result: PAYOUT_RESULT.STALE_OR_DUPLICATE(
                  current.status,
                  targetStatus,
                ),
                processedAt: new Date(),
              },
            },
            { session },
          );
        }
        finalStatus = current.status;
        return;
      }

      const update = {
        status: targetStatus,
        payoutProvider: provider,
      };

      if (normalized.providerReferenceId) {
        update.providerReferenceId = normalized.providerReferenceId;
      }
      if (normalized.providerTransferId) {
        update.providerTransferId = normalized.providerTransferId;
      }
      if (targetStatus === WITHDRAWAL_STATUS.COMPLETED) {
        update.completedAt = current.completedAt || new Date();
        if (normalized.utr) update.utr = normalized.utr;
      }
      if (
        targetStatus === WITHDRAWAL_STATUS.FAILED ||
        targetStatus === WITHDRAWAL_STATUS.REVERSED
      ) {
        update.failureReason = safeText(
          normalized.failureReason || targetStatus,
        );
      }

      const result = await Withdrawal.updateOne(
        { _id: current._id, status: current.status },
        { $set: update },
        { session },
      );
      if (
        !result.modifiedCount &&
        !(
          targetStatus === WITHDRAWAL_STATUS.PROCESSING &&
          current.status === WITHDRAWAL_STATUS.PROCESSING
        )
      ) {
        throw new Error(PAYOUT_MESSAGE.STATE_CHANGED_CONCURRENTLY);
      }

      const eventSourceId =
        eventDoc?.providerEventId || eventDoc?.dedupeKey || null;
      if (targetStatus === WITHDRAWAL_STATUS.COMPLETED) {
        const userBefore = await User.findOneAndUpdate(
          { _id: current.userId },
          { $inc: { totalWithdraw: current.cashAmount } },
          { new: false, session },
        );
        if (!userBefore)
          throw new Error(PAYOUT_MESSAGE.WITHDRAWAL_USER_MISSING);
        await LedgerEntry.create(
          [
            {
              entryKey: `withdrawal:${current._id}:payout-completed`,
              userId: current.userId,
              withdrawalId: current._id,
              providerTransferId: normalized.providerTransferId || null,
              movement: PAYOUT_LEDGER_MOVEMENT.PAYOUT_COMPLETED,
              asset: PAYOUT_CURRENCY.INR,
              amount: current.cashAmount,
              balanceBefore: userBefore.totalWithdraw || 0,
              balanceAfter:
                (userBefore.totalWithdraw || 0) + current.cashAmount,
              source,
              sourceId: eventSourceId,
              metadata: {
                eventType: normalized.eventType || PAYOUT_RESULT.STATUS_CHECK,
                utr: normalized.utr || null,
                provider,
              },
            },
          ],
          { session },
        );
      }

      if (
        targetStatus === WITHDRAWAL_STATUS.FAILED ||
        targetStatus === WITHDRAWAL_STATUS.REVERSED
      ) {
        const refundKey = `withdrawal:${current._id}:coin-refund:${targetStatus.toLowerCase()}`;
        const existingRefund = await LedgerEntry.findOne({
          entryKey: refundKey,
        }).session(session);
        if (!existingRefund) {
          const userBefore = await User.findOneAndUpdate(
            { _id: current.userId },
            { $inc: { hydaconCoins: current.coinAmount } },
            { new: false, session },
          );
          if (!userBefore)
            throw new Error(PAYOUT_MESSAGE.WITHDRAWAL_USER_MISSING);
          await LedgerEntry.create(
            [
              {
                entryKey: refundKey,
                userId: current.userId,
                withdrawalId: current._id,
                providerTransferId: normalized.providerTransferId || null,
                movement: PAYOUT_LEDGER_MOVEMENT.WITHDRAWAL_COIN_REFUND,
                asset: PAYOUT_ASSET.HYDACON_COIN,
                amount: current.coinAmount,
                balanceBefore: userBefore.hydaconCoins || 0,
                balanceAfter:
                  (userBefore.hydaconCoins || 0) + current.coinAmount,
                source,
                sourceId: eventSourceId,
                metadata: {
                  eventType: normalized.eventType || PAYOUT_RESULT.STATUS_CHECK,
                  failureReason: safeText(normalized.failureReason),
                  provider,
                },
              },
            ],
            { session },
          );
        }
      }

      if (targetStatus === WITHDRAWAL_STATUS.REVERSED && alreadyCompleted) {
        const reversalKey = `withdrawal:${current._id}:payout-reversed-inr`;
        const existingReversal = await LedgerEntry.findOne({
          entryKey: reversalKey,
        }).session(session);
        if (!existingReversal) {
          const userBefore = await User.findOneAndUpdate(
            {
              _id: current.userId,
              totalWithdraw: { $gte: current.cashAmount },
            },
            { $inc: { totalWithdraw: -current.cashAmount } },
            { new: false, session },
          );
          if (!userBefore)
            throw new Error(PAYOUT_MESSAGE.REVERSAL_TOTAL_MISMATCH);
          await LedgerEntry.create(
            [
              {
                entryKey: reversalKey,
                userId: current.userId,
                withdrawalId: current._id,
                providerTransferId: normalized.providerTransferId || null,
                movement: PAYOUT_LEDGER_MOVEMENT.PAYOUT_REVERSED,
                asset: PAYOUT_CURRENCY.INR,
                amount: current.cashAmount,
                balanceBefore: userBefore.totalWithdraw || 0,
                balanceAfter: Math.max(
                  0,
                  (userBefore.totalWithdraw || 0) - current.cashAmount,
                ),
                source,
                sourceId: eventSourceId,
                metadata: {
                  eventType: normalized.eventType || PAYOUT_RESULT.STATUS_CHECK,
                  provider,
                },
              },
            ],
            { session },
          );
        }
      }

      if (eventDoc) {
        await PayoutEvent.updateOne(
          {
            _id: eventDoc._id,
            processingStatus: PAYOUT_EVENT_STATUS.PROCESSING,
          },
          {
            $set: {
              processingStatus: PAYOUT_EVENT_STATUS.PROCESSED,
              result: PAYOUT_RESULT.APPLIED(targetStatus),
              processedAt: new Date(),
            },
          },
          { session },
        );
      }
      applied = true;
      finalStatus = targetStatus;
    });
  } catch (error) {
    if (eventDoc) {
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
    throw error;
  } finally {
    await session.endSession();
  }
  return {
    status: PAYOUT_RESULT.SUCCESS,
    processed: applied,
    payoutStatus: finalStatus,
  };
}

module.exports = { applyTransferUpdate, safeText };

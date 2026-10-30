const mongoose = require("mongoose");
const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");
const {
  PAYOUT_EVENT_STATUS,
  PAYOUT_ASSET,
  PAYOUT_CURRENCY,
  PAYOUT_LEDGER_MOVEMENT,
  PAYOUT_SOURCE,
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
  PAYOUT_RESULT,
  PAYOUT_TERMINAL_WITHDRAWAL_STATUSES,
  PAYOUT_FAILURE_TERMINAL_STATUSES,
} = require("../../constants/payouts");
const {
  POINTS_TRANSACTION_TYPE,
  POINTS_TRANSACTION_REASON,
} = require("../../constants/points");
const Withdrawal = require("../../schemas/withdrawal.schema");
const PayoutEvent = require("../../schemas/payout-event.schema");
const User = require("../../schemas/user.schema");
const LedgerEntry = require("../../schemas/ledger-entry.schema");
const PointsLedger = require("../../schemas/points-ledger.schema");
const logger = require("../../config/pino.config");
const { safeText } = require("./payout-utils");

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

async function updateEvent(eventDoc, values, session = null) {
  if (!eventDoc) return;
  const options = session ? { session } : undefined;
  await PayoutEvent.updateOne(
    { _id: eventDoc._id, processingStatus: PAYOUT_EVENT_STATUS.PROCESSING },
    { $set: values },
    options,
  );
}

async function ignoreEvent(eventDoc, reason) {
  await updateEvent(eventDoc, {
    processingStatus: PAYOUT_EVENT_STATUS.IGNORED,
    result: reason,
    processedAt: new Date(),
  });
  return { status: PAYOUT_RESULT.IGNORED, reason };
}

async function validateTransfer(withdrawal, provider, normalized, eventDoc) {
  if (!normalized.targetStatus) {
    return ignoreEvent(eventDoc, PAYOUT_MESSAGE.UNSUPPORTED_PROVIDER_STATUS);
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
    return ignoreEvent(eventDoc, PAYOUT_MESSAGE.AMOUNT_MISMATCH);
  }

  if (normalized.currency && normalized.currency !== PAYOUT_CURRENCY.INR) {
    return ignoreEvent(eventDoc, PAYOUT_MESSAGE.CURRENCY_MISMATCH);
  }
  return null;
}

function buildWithdrawalUpdate(current, provider, normalized, targetStatus) {
  const update = { status: targetStatus, payoutProvider: provider };
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
    update.failureReason = safeText(normalized.failureReason || targetStatus);
  }
  return update;
}

async function updateWithdrawalStatus({
  current,
  provider,
  normalized,
  targetStatus,
  session,
}) {
  const update = buildWithdrawalUpdate(
    current,
    provider,
    normalized,
    targetStatus,
  );
  const result = await Withdrawal.updateOne(
    { _id: current._id, status: current.status },
    { $set: update },
    { session },
  );
  const alreadyProcessing =
    targetStatus === WITHDRAWAL_STATUS.PROCESSING &&
    current.status === WITHDRAWAL_STATUS.PROCESSING;
  if (!result.modifiedCount && !alreadyProcessing) {
    throw new Error(PAYOUT_MESSAGE.STATE_CHANGED_CONCURRENTLY);
  }
}

async function markEventStale(eventDoc, currentStatus, targetStatus, session) {
  await updateEvent(
    eventDoc,
    {
      processingStatus: PAYOUT_EVENT_STATUS.PROCESSED,
      result: PAYOUT_RESULT.STALE_OR_DUPLICATE(currentStatus, targetStatus),
      processedAt: new Date(),
    },
    session,
  );
}

async function markEventApplied(eventDoc, targetStatus, session) {
  await updateEvent(
    eventDoc,
    {
      processingStatus: PAYOUT_EVENT_STATUS.PROCESSED,
      result: PAYOUT_RESULT.APPLIED(targetStatus),
      processedAt: new Date(),
    },
    session,
  );
}

async function markEventFailed(eventDoc, error) {
  await updateEvent(eventDoc, {
    processingStatus: PAYOUT_EVENT_STATUS.FAILED,
    errorMessage: safeText(error.message),
  });
}

async function applyTransferUpdateInTransaction({
  withdrawal,
  provider,
  normalized,
  eventDoc,
  source,
  targetStatus,
  session,
}) {
  const current = await Withdrawal.findById(withdrawal._id)
    .session(session)
    .lean();
  if (!current) throw new Error(PAYOUT_MESSAGE.WITHDRAWAL_NOT_FOUND);

  if (!canApplyPayoutStatus(current.status, targetStatus)) {
    await markEventStale(eventDoc, current.status, targetStatus, session);
    return { processed: false, payoutStatus: current.status };
  }

  const wasCompleted = current.status === WITHDRAWAL_STATUS.COMPLETED;
  await updateWithdrawalStatus({
    current,
    provider,
    normalized,
    targetStatus,
    session,
  });
  await applyPayoutLedgerEffects({
    current,
    provider,
    normalized,
    targetStatus,
    wasCompleted,
    source,
    eventSourceId: eventDoc?.providerEventId || eventDoc?.dedupeKey || null,
    session,
  });
  await markEventApplied(eventDoc, targetStatus, session);

  return { processed: true, payoutStatus: targetStatus };
}

async function applyTransferUpdate({
  withdrawal,
  provider,
  normalized,
  eventDoc = null,
  source = PAYOUT_SOURCE.PAYOUT_RECONCILIATION,
}) {
  const validationResult = await validateTransfer(
    withdrawal,
    provider,
    normalized,
    eventDoc,
  );
  if (validationResult) return validationResult;

  const targetStatus = normalized.targetStatus;
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await applyTransferUpdateInTransaction({
        withdrawal,
        provider,
        normalized,
        eventDoc,
        source,
        targetStatus,
        session,
      });
    });
  } catch (error) {
    await markEventFailed(eventDoc, error);
    throw error;
  } finally {
    await session.endSession();
  }
  return { status: PAYOUT_RESULT.SUCCESS, ...result };
}

async function writeLedgerEntry(entry, session) {
  await LedgerEntry.create([entry], { session });
}

async function recordCompletedPayout({
  current,
  provider,
  normalized,
  source,
  eventSourceId,
  session,
}) {
  const userBefore = await User.findOneAndUpdate(
    { _id: current.userId },
    { $inc: { totalWithdraw: current.cashAmount } },
    { new: false, session },
  );
  if (!userBefore) throw new Error(PAYOUT_MESSAGE.WITHDRAWAL_USER_MISSING);

  await writeLedgerEntry(
    {
      entryKey: `withdrawal:${current._id}:payout-completed`,
      userId: current.userId,
      withdrawalId: current._id,
      providerTransferId: normalized.providerTransferId || null,
      movement: PAYOUT_LEDGER_MOVEMENT.PAYOUT_COMPLETED,
      asset: PAYOUT_CURRENCY.INR,
      amount: current.cashAmount,
      balanceBefore: userBefore.totalWithdraw || 0,
      balanceAfter: (userBefore.totalWithdraw || 0) + current.cashAmount,
      source,
      sourceId: eventSourceId,
      metadata: {
        eventType: normalized.eventType || PAYOUT_RESULT.STATUS_CHECK,
        utr: normalized.utr || null,
        provider,
      },
    },
    session,
  );
}

async function refundWithdrawalBalance({
  current,
  provider,
  normalized,
  targetStatus,
  source,
  eventSourceId,
  session,
}) {
  if (Number.isFinite(current.pointsAmount)) {
    const entryKey = `withdrawal:${current._id}:points-refund:${targetStatus.toLowerCase()}`;
    const existingEntry = await LedgerEntry.findOne({ entryKey }).session(
      session,
    );
    if (existingEntry) return;

    const userBefore = await User.findOneAndUpdate(
      { _id: current.userId },
      { $inc: { totalPoints: current.pointsAmount } },
      { new: false, session },
    );
    if (!userBefore) throw new Error(PAYOUT_MESSAGE.WITHDRAWAL_USER_MISSING);

    const balanceBefore = userBefore.totalPoints || 0;
    const balanceAfter = balanceBefore + current.pointsAmount;
    await PointsLedger.create(
      [
        {
          userId: current.userId,
          amount: current.pointsAmount,
          transactionType: POINTS_TRANSACTION_TYPE.CREDIT,
          reason: POINTS_TRANSACTION_REASON.REFUND,
          description: `Refund for ${targetStatus.toLowerCase()} withdrawal ${current._id}`,
          balance: balanceAfter,
          metadata: {
            withdrawalId: String(current._id),
            provider,
            source,
            sourceId: eventSourceId,
          },
        },
      ],
      { session },
    );
    await writeLedgerEntry(
      {
        entryKey,
        userId: current.userId,
        withdrawalId: current._id,
        providerTransferId: normalized.providerTransferId || null,
        movement: PAYOUT_LEDGER_MOVEMENT.WITHDRAWAL_POINTS_REFUND,
        asset: PAYOUT_ASSET.REWARD_POINT,
        amount: current.pointsAmount,
        balanceBefore,
        balanceAfter,
        source,
        sourceId: eventSourceId,
        metadata: {
          eventType: normalized.eventType || PAYOUT_RESULT.STATUS_CHECK,
          failureReason: safeText(normalized.failureReason),
          provider,
        },
      },
      session,
    );
    return;
  }

  const entryKey = `withdrawal:${current._id}:coin-refund:${targetStatus.toLowerCase()}`;
  const existingEntry = await LedgerEntry.findOne({ entryKey }).session(
    session,
  );
  if (existingEntry) return;

  const userBefore = await User.findOneAndUpdate(
    { _id: current.userId },
    { $inc: { hydaconCoins: current.coinAmount } },
    { new: false, session },
  );
  if (!userBefore) throw new Error(PAYOUT_MESSAGE.WITHDRAWAL_USER_MISSING);

  await writeLedgerEntry(
    {
      entryKey,
      userId: current.userId,
      withdrawalId: current._id,
      providerTransferId: normalized.providerTransferId || null,
      movement: PAYOUT_LEDGER_MOVEMENT.WITHDRAWAL_COIN_REFUND,
      asset: PAYOUT_ASSET.HYDACON_COIN,
      amount: current.coinAmount,
      balanceBefore: userBefore.hydaconCoins || 0,
      balanceAfter: (userBefore.hydaconCoins || 0) + current.coinAmount,
      source,
      sourceId: eventSourceId,
      metadata: {
        eventType: normalized.eventType || PAYOUT_RESULT.STATUS_CHECK,
        failureReason: safeText(normalized.failureReason),
        provider,
      },
    },
    session,
  );
}

async function reverseCompletedPayout({
  current,
  provider,
  normalized,
  source,
  eventSourceId,
  session,
}) {
  const entryKey = `withdrawal:${current._id}:payout-reversed-inr`;
  const existingEntry = await LedgerEntry.findOne({ entryKey }).session(
    session,
  );
  if (existingEntry) return;

  const userBefore = await User.findOneAndUpdate(
    {
      _id: current.userId,
      totalWithdraw: { $gte: current.cashAmount },
    },
    { $inc: { totalWithdraw: -current.cashAmount } },
    { new: false, session },
  );
  if (!userBefore) throw new Error(PAYOUT_MESSAGE.REVERSAL_TOTAL_MISMATCH);

  await writeLedgerEntry(
    {
      entryKey,
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
    session,
  );
}

async function applyPayoutLedgerEffects({
  current,
  provider,
  normalized,
  targetStatus,
  wasCompleted,
  source,
  eventSourceId,
  session,
}) {
  if (targetStatus === WITHDRAWAL_STATUS.COMPLETED) {
    await recordCompletedPayout({
      current,
      provider,
      normalized,
      source,
      eventSourceId,
      session,
    });
  }

  if (
    targetStatus === WITHDRAWAL_STATUS.FAILED ||
    targetStatus === WITHDRAWAL_STATUS.REVERSED
  ) {
    await refundWithdrawalBalance({
      current,
      provider,
      normalized,
      targetStatus,
      source,
      eventSourceId,
      session,
    });
  }

  if (targetStatus === WITHDRAWAL_STATUS.REVERSED && wasCompleted) {
    await reverseCompletedPayout({
      current,
      provider,
      normalized,
      source,
      eventSourceId,
      session,
    });
  }
}

module.exports = { applyTransferUpdate };

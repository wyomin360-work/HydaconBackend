const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");
const {
  PAYOUT_ASSET,
  PAYOUT_CURRENCY,
  PAYOUT_LEDGER_MOVEMENT,
  PAYOUT_MESSAGE,
  PAYOUT_RESULT,
} = require("../../constants/payouts");
const User = require("../../schemas/user.schema");
const LedgerEntry = require("../../schemas/ledger-entry.schema");
const PointsLedger = require("../../schemas/points-ledger.schema");
const {
  POINTS_TRANSACTION_TYPE,
  POINTS_TRANSACTION_REASON,
} = require("../../constants/points");
const { safeText } = require("./payout-utils");

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

module.exports = { applyPayoutLedgerEffects };

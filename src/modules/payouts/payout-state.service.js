const mongoose = require("mongoose");
const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");
const {
  PAYOUT_EVENT_STATUS,
  PAYOUT_OUTBOX_STATUS,
  PAYOUT_BATCH_STATUS,
  PAYOUT_METHOD,
  PAYOUT_MANUAL_REVIEW_RESOLUTION,
  PAYOUT_RECON_OUTCOME,
  PAYOUT_OPERATION,
  PAYOUT_PROVIDER,
  PAYOUT_ASSET,
  PAYOUT_CURRENCY,
  PAYOUT_LEDGER_MOVEMENT,
  PAYOUT_SOURCE,
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
  PAYOUT_ALERT_TYPE,
  PAYOUT_ALERT_SEVERITY,
  PAYOUT_RESULT,
  PAYOUT_TERMINAL_WITHDRAWAL_STATUSES,
  PAYOUT_FAILURE_TERMINAL_STATUSES,
  PAYOUT_EMAIL_TEMPLATE,
  PAYOUT_EMAIL_SUBJECT,
  PAYOUT_HTTP_STATUS,
  PAYOUT_LEDGER_SOURCE,
} = require("../../constants/payouts");
const {
  POINTS_TRANSACTION_TYPE,
  POINTS_TRANSACTION_REASON,
} = require("../../constants/points");
const Withdrawal = require("../../schemas/withdrawal.schema");
const Payout = require("../../schemas/payout.schema");
const PayoutAttempt = require("../../schemas/payout-attempt.schema");
const PayoutOutbox = require("../../schemas/payout-outbox.schema");
const PayoutBatch = require("../../schemas/payout-batch.schema");
const PayoutRecon = require("../../schemas/payout-recon.schema");
const { syncPayoutRecord } = require("./payout-record.service");
const PayoutEvent = require("../../schemas/payout-event.schema");
const User = require("../../schemas/user.schema");
const LedgerEntry = require("../../schemas/ledger-entry.schema");
const PointsLedger = require("../../schemas/points-ledger.schema");
const logger = require("../../config/pino.config");
const { reportPayoutAlert } = require("./payout-alerts");
const { safeText } = require("./payout-utils");
const {
  APP_NOTIFICATIONS,
  getNotification,
} = require("../../constants/notifications");
const { sendFcmNotifications } = require("../../functions/fcm");
const { sendTemplateEmail } = require("../../functions/nodemailer");
const { formatNotification } = require("../../utils/heplers");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { getProvider } = require("../../functions/payouts");

function canApplyPayoutStatus(currentStatus, targetStatus) {
  switch (targetStatus) {
    case WITHDRAWAL_STATUS.PROCESSING:
      return (
        currentStatus !== WITHDRAWAL_STATUS.REQUIRES_REVIEW &&
        !PAYOUT_TERMINAL_WITHDRAWAL_STATUSES.includes(currentStatus)
      );
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
    reportPayoutAlert({
      type: PAYOUT_ALERT_TYPE.RECONCILIATION_MISMATCH,
      severity: PAYOUT_ALERT_SEVERITY.CRITICAL,
      summary: PAYOUT_MESSAGE.AMOUNT_MISMATCH,
      error: new Error(PAYOUT_MESSAGE.AMOUNT_MISMATCH),
      provider,
      withdrawalId: String(withdrawal._id),
      details: {
        providerTransferId: normalized.providerTransferId || null,
        mismatchType: "amount",
      },
    });
    return ignoreEvent(eventDoc, PAYOUT_MESSAGE.AMOUNT_MISMATCH);
  }

  if (normalized.currency && normalized.currency !== PAYOUT_CURRENCY.INR) {
    reportPayoutAlert({
      type: PAYOUT_ALERT_TYPE.RECONCILIATION_MISMATCH,
      severity: PAYOUT_ALERT_SEVERITY.CRITICAL,
      summary: PAYOUT_MESSAGE.CURRENCY_MISMATCH,
      error: new Error(PAYOUT_MESSAGE.CURRENCY_MISMATCH),
      provider,
      withdrawalId: String(withdrawal._id),
      details: {
        providerTransferId: normalized.providerTransferId || null,
        mismatchType: "currency",
      },
    });
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
    update.failureReason = null;
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
  await syncPayoutRecord(current._id, update, session);
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
  manualReviewResolution = PAYOUT_MANUAL_REVIEW_RESOLUTION.PROVIDER_CONFIRMED,
  manualReviewResolvedByAdminId = null,
  manualReviewResolutionNotes = null,
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
  if (
    current.status === WITHDRAWAL_STATUS.REQUIRES_REVIEW &&
    targetStatus !== WITHDRAWAL_STATUS.PROCESSING
  ) {
    const resolvedAt = new Date();
    await PayoutOutbox.updateOne(
      { withdrawalId: current._id, manualReviewRequired: true },
      {
        $set: {
          manualReviewRequired: false,
          manualReviewResolvedAt: resolvedAt,
          manualReviewResolvedByAdminId,
          manualReviewResolution,
          manualReviewResolutionNotes: manualReviewResolutionNotes
            ? safeText(manualReviewResolutionNotes)
            : null,
        },
      },
      { session },
    );
    await resolveBatchManualReviewIfComplete(
      current.payoutBatchId,
      resolvedAt,
      session,
    );
  }
  await markEventApplied(eventDoc, targetStatus, session);

  return { processed: true, payoutStatus: targetStatus };
}

async function applyTransferUpdate({
  withdrawal,
  provider,
  normalized,
  eventDoc = null,
  source = PAYOUT_SOURCE.PAYOUT_RECONCILIATION,
  manualReviewResolution,
  manualReviewResolvedByAdminId,
  manualReviewResolutionNotes,
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
        manualReviewResolution,
        manualReviewResolvedByAdminId,
        manualReviewResolutionNotes,
        session,
      });
    });
  } catch (error) {
    await markEventFailed(eventDoc, error);
    throw error;
  } finally {
    await session.endSession();
  }
  if (result?.processed) {
    notifyUserOfPayoutOutcome({ withdrawal, targetStatus, normalized }).catch(
      (error) => {
        logger.error(PAYOUT_MESSAGE.PAYOUT_NOTIFICATION_LOG, {
          withdrawalId: String(withdrawal._id),
          error: safeText(error.message),
        });
      },
    );
  }
  return { status: PAYOUT_RESULT.SUCCESS, ...result };
}

/** Sends notifications after a terminal payout state and ledger commit. */
async function notifyUserOfPayoutOutcome({
  withdrawal,
  targetStatus,
  normalized,
}) {
  const notificationKey = getPayoutNotificationKey(targetStatus);
  if (!notificationKey) return;

  const user = await User.findById(withdrawal.userId)
    .select("name email fcmTokens enableNotification language")
    .lean();
  if (!user) return;

  const notification = getNotification(
    APP_NOTIFICATIONS.withdraw[notificationKey],
    user.language,
  );
  const notificationBody = formatNotification(notification.body, {
    amount: withdrawal.cashAmount,
    failureReason: safeText(
      normalized.failureReason || PAYOUT_MESSAGE.WITHDRAWAL_FAILED_DEFAULT,
    ),
  });

  sendPayoutFcm({
    user,
    withdrawal,
    notification,
    notificationBody,
  });
  sendPayoutEmail({ user, withdrawal, targetStatus, normalized });
}

function getPayoutNotificationKey(status) {
  switch (status) {
    case WITHDRAWAL_STATUS.COMPLETED:
      return "success";
    case WITHDRAWAL_STATUS.FAILED:
      return "failed";
    case WITHDRAWAL_STATUS.REVERSED:
      return "reversed";
    default:
      return null;
  }
}

function sendPayoutFcm({ user, withdrawal, notification, notificationBody }) {
  if (!user.enableNotification || !user.fcmTokens?.length) return;

  void sendPayoutNotificationWithRetry(
    (tokens) =>
      sendFcmNotifications(tokens, notification.title, notificationBody),
    (result) => result && result.errors?.length === 0,
    PAYOUT_MESSAGE.FCM_NOTIFICATION_LOG,
    String(withdrawal._id),
    user.fcmTokens,
    (result) => result?.errors || [],
  );
}

function sendPayoutEmail({ user, withdrawal, targetStatus, normalized }) {
  if (!user.email || !isEmailNotificationStatus(targetStatus)) return;

  const email = getPayoutEmail(targetStatus, {
    userName: user.name || "there",
    amount: Number(withdrawal.cashAmount).toFixed(2),
    withdrawalId: String(withdrawal._id),
    utr: normalized.utr || "Not available",
    failureReason: safeText(
      normalized.failureReason || PAYOUT_MESSAGE.WITHDRAWAL_FAILED_DEFAULT,
    ),
  });

  void sendPayoutNotificationWithRetry(
    () =>
      sendTemplateEmail(user.email, email.template, email.subject, email.data),
    (sent) => sent === true,
    PAYOUT_MESSAGE.EMAIL_NOTIFICATION_LOG,
    String(withdrawal._id),
  );
}

/** Retries one non-critical notification once without joining payout transactions. */
async function sendPayoutNotificationWithRetry(
  send,
  isSuccessful,
  logMessage,
  withdrawalId,
  retryInput,
  getRetryInput,
) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, PAYOUT_CONFIG.PAYOUT_NOTIFICATION_RETRY_DELAY_MS),
      );
    }
    try {
      const result = await send(retryInput);
      if (isSuccessful(result)) return;
      lastError = null;
      if (getRetryInput) retryInput = getRetryInput(result);
    } catch (error) {
      lastError = error;
    }
  }
  logger.error(logMessage, {
    withdrawalId,
    ...(lastError ? { error: safeText(lastError.message) } : {}),
    retryCount: 1,
  });
}

function isEmailNotificationStatus(status) {
  return (
    status === WITHDRAWAL_STATUS.COMPLETED ||
    status === WITHDRAWAL_STATUS.FAILED
  );
}

function getPayoutEmail(status, data) {
  const isSuccess = status === WITHDRAWAL_STATUS.COMPLETED;
  return {
    template: isSuccess
      ? PAYOUT_EMAIL_TEMPLATE.WITHDRAWAL_SUCCESS
      : PAYOUT_EMAIL_TEMPLATE.WITHDRAWAL_FAILED,
    subject: isSuccess
      ? PAYOUT_EMAIL_SUBJECT.WITHDRAWAL_SUCCESS
      : PAYOUT_EMAIL_SUBJECT.WITHDRAWAL_FAILED,
    data,
  };
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

/** Loads a manual payout only while it is pending and has no provider activity. */
async function loadPendingManualPayout(withdrawalId, session) {
  const payout = await Payout.findOne({
    withdrawalId,
    isManualPayout: true,
    payoutMethod: PAYOUT_METHOD.MANUAL,
    status: WITHDRAWAL_STATUS.PENDING,
  })
    .lean()
    .session(session);
  const withdrawal = await Withdrawal.findOne({
    _id: withdrawalId,
    status: WITHDRAWAL_STATUS.PROCESSING,
    isManualPayout: true,
  })
    .lean()
    .session(session);
  const attemptCount = await PayoutAttempt.countDocuments({
    withdrawalId,
  }).session(session);
  if (
    !payout ||
    !withdrawal ||
    attemptCount > 0 ||
    withdrawal.providerTransferId
  ) {
    sendFailResponse(
      PAYOUT_MESSAGE.MANUAL_PAYOUT_ONLY,
      PAYOUT_HTTP_STATUS.CONFLICT,
    );
  }
  return { payout, withdrawal };
}

/** Completes a manual payment once, records its reference, and posts the payout ledger. */
async function completeManualPayout(adminId, withdrawalId, data) {
  const paymentReference = safeText(
    data.paymentReference,
    PAYOUT_CONFIG.MANUAL_PAYMENT_REFERENCE_MAX_LENGTH,
  );
  const utr = data.utr
    ? safeText(data.utr, PAYOUT_CONFIG.MANUAL_UTR_MAX_LENGTH)
    : null;
  const notes = data.notes
    ? safeText(data.notes, PAYOUT_CONFIG.MANUAL_COMPLETION_NOTES_MAX_LENGTH)
    : null;
  if (
    !paymentReference ||
    paymentReference.length < PAYOUT_CONFIG.MANUAL_PAYMENT_REFERENCE_MIN_LENGTH
  ) {
    sendFailResponse(PAYOUT_MESSAGE.MANUAL_PAYOUT_REFERENCE_REQUIRED);
  }

  const session = await mongoose.startSession();
  let withdrawal;
  let completedAt;
  try {
    await session.withTransaction(async () => {
      const pending = await loadPendingManualPayout(withdrawalId, session);
      withdrawal = pending.withdrawal;
      completedAt = new Date();
      const update = {
        status: WITHDRAWAL_STATUS.COMPLETED,
        completedAt,
        utr,
        manualPaymentReference: paymentReference,
        manualCompletionNotes: notes,
        manualCompletedByAdminId: adminId,
        manualCompletedAt: completedAt,
      };
      const changed = await Withdrawal.updateOne(
        {
          _id: withdrawalId,
          status: WITHDRAWAL_STATUS.PROCESSING,
          isManualPayout: true,
        },
        { $set: update },
        { session },
      );
      if (!changed.modifiedCount) {
        sendFailResponse(
          PAYOUT_MESSAGE.MANUAL_PAYOUT_ONLY,
          PAYOUT_HTTP_STATUS.CONFLICT,
        );
      }
      await syncPayoutRecord(withdrawalId, update, session);
      await applyPayoutLedgerEffects({
        current: withdrawal,
        provider: PAYOUT_PROVIDER.MANUAL,
        normalized: {
          targetStatus: WITHDRAWAL_STATUS.COMPLETED,
          utr,
          providerTransferId: null,
          eventType: PAYOUT_RESULT.MANUAL_COMPLETION,
        },
        targetStatus: WITHDRAWAL_STATUS.COMPLETED,
        wasCompleted: false,
        source: PAYOUT_LEDGER_SOURCE.MANUAL_PAYOUT,
        eventSourceId: String(adminId),
        session,
      });
    });
  } finally {
    await session.endSession();
  }
  notifyUserOfPayoutOutcome({
    withdrawal,
    targetStatus: WITHDRAWAL_STATUS.COMPLETED,
    normalized: { utr, providerTransferId: null },
  }).catch((error) => {
    logger.error("Manual payout completion notification failed", {
      withdrawalId: String(withdrawalId),
      error: safeText(error.message),
    });
  });
  return {
    message: PAYOUT_MESSAGE.MANUAL_PAYOUT_COMPLETED,
    manualPayoutCompleted: true,
    data: {
      id: String(withdrawalId),
      status: WITHDRAWAL_STATUS.COMPLETED,
      completedAt,
    },
  };
}

/** Records a separately settled bank transfer after an exhausted payout is reviewed. */
async function completeManualReviewPayout(adminId, withdrawalId, data) {
  if (data.confirmation !== true) {
    sendFailResponse(PAYOUT_MESSAGE.MANUAL_REVIEW_CONFIRMATION_REQUIRED);
  }
  const paymentReference = safeText(
    data.paymentReference,
    PAYOUT_CONFIG.MANUAL_PAYMENT_REFERENCE_MAX_LENGTH,
  );
  const utr = data.utr
    ? safeText(data.utr, PAYOUT_CONFIG.MANUAL_UTR_MAX_LENGTH)
    : null;
  const notes = data.notes
    ? safeText(data.notes, PAYOUT_CONFIG.MANUAL_COMPLETION_NOTES_MAX_LENGTH)
    : null;
  if (
    !paymentReference ||
    paymentReference.length < PAYOUT_CONFIG.MANUAL_PAYMENT_REFERENCE_MIN_LENGTH
  ) {
    sendFailResponse(PAYOUT_MESSAGE.MANUAL_PAYOUT_REFERENCE_REQUIRED);
  }

  const session = await mongoose.startSession();
  let withdrawal;
  let completedAt;
  try {
    await session.withTransaction(async () => {
      const { pendingWithdrawal, outbox } = await loadManualReviewPayout(
        withdrawalId,
        session,
      );
      withdrawal = pendingWithdrawal;
      completedAt = new Date();
      const update = {
        status: WITHDRAWAL_STATUS.COMPLETED,
        payoutMethod: PAYOUT_METHOD.MANUAL,
        isManualPayout: true,
        completedAt,
        utr,
        manualPaymentReference: paymentReference,
        manualCompletionNotes: notes,
        manualCompletedByAdminId: adminId,
        manualCompletedAt: completedAt,
        failureReason: null,
      };
      const changed = await Withdrawal.updateOne(
        { _id: withdrawalId, status: WITHDRAWAL_STATUS.REQUIRES_REVIEW },
        { $set: update },
        { session },
      );
      if (!changed.modifiedCount) {
        sendFailResponse(
          PAYOUT_MESSAGE.MANUAL_REVIEW_PAYOUT_ONLY,
          PAYOUT_HTTP_STATUS.CONFLICT,
        );
      }
      await syncPayoutRecord(withdrawalId, update, session);
      const outboxUpdate = await PayoutOutbox.updateOne(
        {
          _id: outbox._id,
          status: PAYOUT_OUTBOX_STATUS.FAILED,
          manualReviewRequired: true,
        },
        {
          $set: {
            manualReviewRequired: false,
            manualReviewResolvedAt: completedAt,
            manualReviewResolvedByAdminId: adminId,
            manualReviewResolution:
              PAYOUT_MANUAL_REVIEW_RESOLUTION.MANUAL_SETTLEMENT,
          },
        },
        { session },
      );
      if (!outboxUpdate.modifiedCount) {
        sendFailResponse(
          PAYOUT_MESSAGE.MANUAL_REVIEW_PAYOUT_ONLY,
          PAYOUT_HTTP_STATUS.CONFLICT,
        );
      }
      await resolveBatchManualReviewIfComplete(
        pendingWithdrawal.payoutBatchId,
        completedAt,
        session,
      );
      await applyPayoutLedgerEffects({
        current: pendingWithdrawal,
        provider: PAYOUT_PROVIDER.MANUAL,
        normalized: {
          targetStatus: WITHDRAWAL_STATUS.COMPLETED,
          utr,
          providerTransferId: null,
          eventType: PAYOUT_RESULT.MANUAL_COMPLETION,
        },
        targetStatus: WITHDRAWAL_STATUS.COMPLETED,
        wasCompleted: false,
        source: PAYOUT_LEDGER_SOURCE.MANUAL_PAYOUT,
        eventSourceId: String(adminId),
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  notifyUserOfPayoutOutcome({
    withdrawal,
    targetStatus: WITHDRAWAL_STATUS.COMPLETED,
    normalized: { utr, providerTransferId: null },
  }).catch((error) => {
    logger.error(PAYOUT_MESSAGE.PAYOUT_NOTIFICATION_LOG, {
      withdrawalId: String(withdrawalId),
      error: safeText(error.message),
    });
  });
  return {
    message: PAYOUT_MESSAGE.MANUAL_REVIEW_PAYOUT_COMPLETED,
    manualReviewPayoutCompleted: true,
    data: {
      id: String(withdrawalId),
      status: WITHDRAWAL_STATUS.COMPLETED,
      completedAt,
    },
  };
}

/** Refunds an exhausted payout only after its provider confirms a matching failure. */
async function failManualReviewPayout(adminId, withdrawalId, data) {
  if (data.confirmation !== true) {
    sendFailResponse(
      PAYOUT_MESSAGE.MANUAL_REVIEW_FAILURE_CONFIRMATION_REQUIRED,
    );
  }
  const resolutionNotes = safeText(
    data.reason,
    PAYOUT_CONFIG.MANUAL_COMPLETION_NOTES_MAX_LENGTH,
  );
  if (
    !resolutionNotes ||
    resolutionNotes.length < PAYOUT_CONFIG.CANCELLATION_REASON_MIN_LENGTH
  ) {
    sendFailResponse(PAYOUT_MESSAGE.CANCELLATION_REASON_REQUIRED);
  }

  const withdrawal = await Withdrawal.findOne({
    _id: withdrawalId,
    status: WITHDRAWAL_STATUS.REQUIRES_REVIEW,
  }).lean();
  const outbox = await PayoutOutbox.findOne({
    withdrawalId,
    status: PAYOUT_OUTBOX_STATUS.FAILED,
    manualReviewRequired: true,
  }).lean();
  if (!withdrawal || !outbox) {
    sendFailResponse(
      PAYOUT_MESSAGE.MANUAL_REVIEW_PAYOUT_ONLY,
      PAYOUT_HTTP_STATUS.CONFLICT,
    );
  }

  const provider = getProvider(withdrawal.payoutProvider);
  provider.validateConfig?.();
  const requestedAt = new Date();
  let transfer;
  try {
    transfer = await provider.getTransferStatus({
      referenceId: withdrawal.providerReferenceId,
    });
  } catch (error) {
    await recordManualReviewProviderLookup({
      withdrawal,
      requestedAt,
      outcome: PAYOUT_RECON_OUTCOME.ERROR,
      error,
    });
    throw error;
  }

  if (!transfer) {
    await recordManualReviewProviderLookup({
      withdrawal,
      requestedAt,
      outcome: PAYOUT_RECON_OUTCOME.NOT_FOUND,
    });
    sendFailResponse(
      PAYOUT_MESSAGE.MANUAL_REVIEW_PROVIDER_STATUS_REQUIRED,
      PAYOUT_HTTP_STATUS.CONFLICT,
    );
  }

  if (!matchesManualReviewTransfer(withdrawal, transfer)) {
    await recordManualReviewProviderLookup({
      withdrawal,
      requestedAt,
      outcome: PAYOUT_RECON_OUTCOME.MISMATCH,
      transfer,
      error: new Error(PAYOUT_MESSAGE.PROVIDER_TRANSFER_DETAILS_MISMATCH),
    });
    reportPayoutAlert({
      type: PAYOUT_ALERT_TYPE.RECONCILIATION_MISMATCH,
      severity: PAYOUT_ALERT_SEVERITY.CRITICAL,
      summary: PAYOUT_MESSAGE.PROVIDER_TRANSFER_DETAILS_MISMATCH,
      error: new Error(PAYOUT_MESSAGE.PROVIDER_TRANSFER_DETAILS_MISMATCH),
      provider: withdrawal.payoutProvider,
      withdrawalId: String(withdrawalId),
      details: {
        providerTransferId: transfer.providerTransferId || null,
        mismatchType: "manual-review-resolution",
      },
    });
    sendFailResponse(
      PAYOUT_MESSAGE.PROVIDER_TRANSFER_DETAILS_MISMATCH,
      PAYOUT_HTTP_STATUS.CONFLICT,
    );
  }

  await recordManualReviewProviderLookup({
    withdrawal,
    requestedAt,
    outcome: PAYOUT_RECON_OUTCOME.MATCHED,
    transfer,
  });
  if (transfer.targetStatus !== WITHDRAWAL_STATUS.FAILED) {
    sendFailResponse(
      PAYOUT_MESSAGE.MANUAL_REVIEW_PROVIDER_NOT_FAILED(
        safeText(
          transfer.status ||
            transfer.rawStatus ||
            PAYOUT_MESSAGE.PROVIDER_STATUS_UNKNOWN,
          PAYOUT_CONFIG.MAX_ERROR_LENGTH,
        ),
      ),
      PAYOUT_HTTP_STATUS.CONFLICT,
    );
  }

  const result = await applyTransferUpdate({
    withdrawal,
    provider: withdrawal.payoutProvider,
    normalized: transfer,
    source: PAYOUT_SOURCE.PAYOUT_RECONCILIATION,
    manualReviewResolution:
      PAYOUT_MANUAL_REVIEW_RESOLUTION.ADMIN_CONFIRMED_FAILURE,
    manualReviewResolvedByAdminId: adminId,
    manualReviewResolutionNotes: resolutionNotes,
  });
  if (!result.processed || result.payoutStatus !== WITHDRAWAL_STATUS.FAILED) {
    sendFailResponse(
      PAYOUT_MESSAGE.MANUAL_REVIEW_PAYOUT_ONLY,
      PAYOUT_HTTP_STATUS.CONFLICT,
    );
  }
  return {
    message: PAYOUT_MESSAGE.MANUAL_REVIEW_PAYOUT_FAILED,
    manualReviewPayoutFailed: true,
    data: { id: String(withdrawalId), status: WITHDRAWAL_STATUS.FAILED },
  };
}

/** Requires the provider reference, amount, and currency to match before refund. */
function matchesManualReviewTransfer(withdrawal, transfer) {
  const expectedAmountMinor = Math.round(
    Number(withdrawal.cashAmount) * PAYOUT_CONFIG.MINOR_UNITS_PER_INR,
  );
  return (
    transfer.providerReferenceId === withdrawal.providerReferenceId &&
    Number(transfer.amountMinor) === expectedAmountMinor &&
    transfer.currency === PAYOUT_CURRENCY.INR
  );
}

/** Audits provider status checks made during an admin review resolution. */
async function recordManualReviewProviderLookup({
  withdrawal,
  requestedAt,
  outcome,
  transfer,
  error,
}) {
  await PayoutRecon.create({
    withdrawalId: withdrawal._id,
    provider: withdrawal.payoutProvider,
    providerTransferId: transfer?.providerTransferId || null,
    providerReferenceId: withdrawal.providerReferenceId,
    referenceId: withdrawal.providerReferenceId,
    requestedAt,
    operation: PAYOUT_OPERATION.TRANSFER_STATUS_LOOKUP,
    outcome,
    providerStatus: transfer?.status || transfer?.rawStatus || null,
    providerErrorCode: error?.providerErrorCode
      ? safeText(error.providerErrorCode)
      : null,
    providerResponse: transfer?.safeResponse || {},
    errorMessage: error ? safeText(error.message) : null,
  });
}

/** Clears a batch-level review state once all of its flagged transfers are resolved. */
async function resolveBatchManualReviewIfComplete(
  batchId,
  resolvedAt,
  session,
) {
  if (!batchId) return;
  const unresolvedCount = await PayoutOutbox.countDocuments({
    executionBatchId: batchId,
    manualReviewRequired: true,
  }).session(session);
  if (unresolvedCount > 0) return;
  await PayoutBatch.updateOne(
    { _id: batchId, status: PAYOUT_BATCH_STATUS.MANUAL_REVIEW },
    {
      $set: {
        status: PAYOUT_BATCH_STATUS.RESOLVED,
        availableAt: null,
        leaseExpiresAt: null,
        processedAt: resolvedAt,
      },
    },
    { session },
  );
}

/** Requires an exhausted outbox review flag and an explicit admin settlement record. */
async function loadManualReviewPayout(withdrawalId, session) {
  const payout = await Payout.findOne({
    withdrawalId,
    status: WITHDRAWAL_STATUS.REQUIRES_REVIEW,
  })
    .lean()
    .session(session);
  const pendingWithdrawal = await Withdrawal.findOne({
    _id: withdrawalId,
    status: WITHDRAWAL_STATUS.REQUIRES_REVIEW,
  })
    .lean()
    .session(session);
  const outbox = await PayoutOutbox.findOne({
    withdrawalId,
    status: PAYOUT_OUTBOX_STATUS.FAILED,
    manualReviewRequired: true,
  })
    .lean()
    .session(session);
  if (!payout || !pendingWithdrawal || !outbox) {
    sendFailResponse(
      PAYOUT_MESSAGE.MANUAL_REVIEW_PAYOUT_ONLY,
      PAYOUT_HTTP_STATUS.CONFLICT,
    );
  }
  return { payout, pendingWithdrawal, outbox };
}

module.exports = {
  applyTransferUpdate,
  applyPayoutLedgerEffects,
  notifyUserOfPayoutOutcome,
  loadPendingManualPayout,
  completeManualPayout,
  completeManualReviewPayout,
  failManualReviewPayout,
};

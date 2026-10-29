const {
  PAYOUT_PROVIDER,
  CASHFREE_PAYOUT_STATUS,
  PAYOUT_OUTBOX_STATUS: OUTBOX,
  PAYOUT_BATCH_STATUS: BATCH,
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
} = require("../../constants/payouts");
const PayoutOutbox = require("../../schemas/payout-outbox.schema");
const PayoutBatch = require("../../schemas/payout-batch.schema");
const {
  markBatchAmbiguous,
  submitOrReconcileBatch,
} = require("./payout-batch-transfer.service");
const { safeText } = require("./payout-utils");
const logger = require("../../config/pino.config");

async function processPayoutBatchOutboxBatch(
  limit = PAYOUT_CONFIG.OUTBOX_BATCH_SIZE,
) {
  for (let index = 0; index < limit; index += 1) {
    const now = new Date();
    const batch = await PayoutBatch.findOneAndUpdate(
      {
        status: {
          $in: [
            BATCH.PENDING,
            BATCH.RECONCILIATION_REQUIRED,
            BATCH.PROCESSING,
            BATCH.SUBMITTED,
            BATCH.RECONCILED,
          ],
        },
        availableAt: { $lte: now },
        $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lte: now } }],
      },
      {
        $set: {
          status: BATCH.PROCESSING,
          leaseExpiresAt: new Date(
            now.getTime() + PAYOUT_CONFIG.OUTBOX_LEASE_MS,
          ),
        },
        $inc: { attempts: 1 },
      },
      { new: true, sort: { availableAt: 1 } },
    );
    if (!batch) break;
    const leaseHeartbeat = startBatchLeaseHeartbeat(batch);
    try {
      await submitOrReconcileBatch(batch);
    } catch (error) {
      await markBatchAmbiguous(batch, error);
      logger.error(PAYOUT_MESSAGE.PAYOUT_BATCH_WORKER_FAILED, {
        batchReferenceId: batch.batchReferenceId,
        error: safeText(error.message),
      });
    } finally {
      clearInterval(leaseHeartbeat);
    }
  }
}

function startBatchLeaseHeartbeat(batch) {
  return setInterval(() => {
    PayoutBatch.updateOne(
      {
        _id: batch._id,
        status: { $in: [BATCH.PROCESSING, BATCH.RECONCILIATION_REQUIRED] },
      },
      {
        $set: {
          leaseExpiresAt: new Date(Date.now() + PAYOUT_CONFIG.OUTBOX_LEASE_MS),
        },
      },
    ).catch((error) => {
      logger.error(PAYOUT_MESSAGE.PAYOUT_BATCH_WORKER_FAILED, {
        batchReferenceId: batch.batchReferenceId,
        error: safeText(error.message),
      });
    });
  }, PAYOUT_CONFIG.OUTBOX_LEASE_RENEW_INTERVAL_MS);
}

function wakePayoutBatchWorker() {
  processPayoutBatchOutboxBatch(PAYOUT_CONFIG.OUTBOX_BATCH_SIZE).catch(
    (error) => {
      logger.error(PAYOUT_MESSAGE.PAYOUT_BATCH_WORKER_FAILED, {
        error: safeText(error.message),
      });
    },
  );
}

async function queueCashfreeBatchReconciliation(normalized) {
  const batch = await findCashfreeBatch(normalized);
  if (!batch) return false;

  const queuedBatch = await PayoutBatch.findOneAndUpdate(
    { _id: batch._id, status: { $ne: BATCH.FAILED } },
    {
      $set: {
        status: BATCH.RECONCILIATION_REQUIRED,
        providerStatus: CASHFREE_PAYOUT_STATUS.REJECTED,
        lastError: PAYOUT_MESSAGE.PAYOUT_BATCH_RECONCILIATION_QUEUED,
        availableAt: new Date(),
      },
    },
    { new: true },
  );
  if (!queuedBatch) return false;

  await PayoutOutbox.updateMany(
    { executionBatchId: batch._id, status: OUTBOX.SUBMITTED },
    {
      $set: {
        status: OUTBOX.RECONCILIATION_REQUIRED,
        lastError: PAYOUT_MESSAGE.PAYOUT_BATCH_RECONCILIATION_QUEUED,
        availableAt: new Date(),
      },
    },
  );
  wakePayoutBatchWorker();
  return true;
}

async function findCashfreeBatch(normalized) {
  const providerFilter = { provider: PAYOUT_PROVIDER.CASHFREE };
  let batch = null;

  if (normalized.batchReferenceId) {
    batch = await PayoutBatch.findOne({
      ...providerFilter,
      batchReferenceId: normalized.batchReferenceId,
    }).lean();
  }

  if (
    batch &&
    normalized.providerBatchTransferId &&
    batch.providerBatchTransferId &&
    batch.providerBatchTransferId !== normalized.providerBatchTransferId
  ) {
    return null;
  }
  if (batch || !normalized.providerBatchTransferId) return batch;

  return PayoutBatch.findOne({
    ...providerFilter,
    providerBatchTransferId: normalized.providerBatchTransferId,
  }).lean();
}

module.exports = {
  processPayoutBatchOutboxBatch,
  wakePayoutBatchWorker,
  queueCashfreeBatchReconciliation,
};

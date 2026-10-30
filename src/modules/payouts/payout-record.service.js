const Payout = require("../../schemas/payout.schema");

/** Builds the persisted payout snapshot from its approved withdrawal. */
function buildPayoutRecord(withdrawal, approval) {
  const payoutApproval = approval || {};
  const approvedAt = payoutApproval.approvedAt || withdrawal.approvedAt;
  const providerReferenceId =
    payoutApproval.providerReferenceId ||
    withdrawal.providerReferenceId ||
    String(withdrawal._id);

  return {
    _id: withdrawal._id,
    withdrawalId: withdrawal._id,
    userId: withdrawal.userId,
    bankAccountId: withdrawal.bankAccountId,
    withdrawalCreatedAt: withdrawal.createdAt,
    cashAmount: withdrawal.cashAmount,
    pointsAmount: withdrawal.pointsAmount,
    coinAmount: withdrawal.coinAmount,
    pointConversionSnapshot: withdrawal.pointConversionSnapshot,
    status: payoutApproval.status || withdrawal.status,
    payoutProvider: payoutApproval.provider || withdrawal.payoutProvider,
    payoutBatchId:
      payoutApproval.payoutBatchId === undefined
        ? withdrawal.payoutBatchId || null
        : payoutApproval.payoutBatchId,
    providerReferenceId,
    providerTransferId: withdrawal.providerTransferId || null,
    utr: withdrawal.utr || null,
    approvalSource: payoutApproval.approvalSource || withdrawal.approvalSource,
    approvedBy:
      payoutApproval.adminId === undefined
        ? withdrawal.approvedBy || null
        : payoutApproval.adminId,
    approvedAt,
    cancelledBy: withdrawal.cancelledBy || null,
    cancelledAt: withdrawal.cancelledAt || null,
    completedAt: withdrawal.completedAt || null,
    failureReason: withdrawal.failureReason || null,
    remarks: withdrawal.remarks || null,
  };
}

/** Creates the payout document once approval is committed, or refreshes its retry state. */
async function createOrUpdatePayoutRecord({ withdrawal, approval, session }) {
  const options = {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    ...(session ? { session } : {}),
  };

  const operation = buildPayoutRecordUpsertOperation(withdrawal, approval);
  return Payout.findOneAndUpdate(
    operation.updateOne.filter,
    operation.updateOne.update,
    options,
  );
}

/** Builds an idempotent payout upsert for transactional bulk approval. */
function buildPayoutRecordUpsertOperation(withdrawal, approval) {
  const record = buildPayoutRecord(withdrawal, approval);
  const { _id, withdrawalId, ...recordFields } = record;

  return {
    updateOne: {
      filter: { withdrawalId },
      update: {
        $set: recordFields,
        $setOnInsert: {
          _id,
          withdrawalId,
          createdAt: approval?.payoutCreatedAt || record.approvedAt,
        },
      },
      upsert: true,
    },
  };
}

/** Mirrors state changes after a payout document has already been created. */
async function syncPayoutRecord(withdrawalId, fields, session) {
  const options = session ? { session } : undefined;
  return Payout.updateOne({ withdrawalId }, { $set: fields }, options);
}

module.exports = {
  buildPayoutRecord,
  buildPayoutRecordUpsertOperation,
  createOrUpdatePayoutRecord,
  syncPayoutRecord,
};

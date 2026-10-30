require("dotenv").config();
const mongoose = require("mongoose");
const { WITHDRAWAL_STATUS } = require("../src/constants/withdrawals");
const {
  PAYOUT_APPROVAL_SOURCE,
  PAYOUT_PROVIDER_VALUES,
} = require("../src/constants/payouts");
const Withdrawal = require("../src/schemas/withdrawal.schema");
const Payout = require("../src/schemas/payout.schema");
const {
  buildPayoutRecordUpsertOperation,
} = require("../src/modules/payouts/payout-record.service");

const BATCH_SIZE = 500;
const STATUSES_THAT_PROVE_APPROVAL = [
  WITHDRAWAL_STATUS.PROCESSING,
  WITHDRAWAL_STATUS.COMPLETED,
  WITHDRAWAL_STATUS.FAILED,
  WITHDRAWAL_STATUS.REVERSED,
];

function buildEligibleWithdrawalQuery() {
  return {
    payoutProvider: { $in: PAYOUT_PROVIDER_VALUES },
    $or: [
      { approvalSource: { $in: Object.values(PAYOUT_APPROVAL_SOURCE) } },
      { providerTransferId: { $exists: true, $nin: [null, ""] } },
      { payoutAttemptCount: { $gt: 0 } },
      { status: { $in: STATUSES_THAT_PROVE_APPROVAL } },
    ],
  };
}

function buildHistoricalPayoutOperation(withdrawal) {
  const approvedAt = withdrawal.approvedAt || withdrawal.createdAt;
  const approvalSource =
    withdrawal.approvalSource ||
    (withdrawal.approvedBy
      ? PAYOUT_APPROVAL_SOURCE.ADMIN
      : PAYOUT_APPROVAL_SOURCE.AUTO);
  const payoutWithdrawal = {
    ...withdrawal,
    approvedAt,
    approvalSource,
  };

  return buildPayoutRecordUpsertOperation(payoutWithdrawal, {
    status: withdrawal.status,
    provider: withdrawal.payoutProvider,
    providerReferenceId:
      withdrawal.providerReferenceId || String(withdrawal._id),
    payoutBatchId: withdrawal.payoutBatchId || null,
    adminId: withdrawal.approvedBy || null,
    approvalSource,
    approvedAt,
    payoutCreatedAt: approvedAt,
  });
}

async function migratePayoutRecords() {
  if (!process.env.MONGODB_URL) {
    throw new Error("MONGODB_URL is required to migrate payout records");
  }

  await mongoose.connect(process.env.MONGODB_URL);
  await Payout.createIndexes();
  const cursor = Withdrawal.find(buildEligibleWithdrawalQuery())
    .lean()
    .cursor({ batchSize: BATCH_SIZE });
  let operations = [];
  let migratedCount = 0;

  for await (const withdrawal of cursor) {
    operations.push(buildHistoricalPayoutOperation(withdrawal));
    if (operations.length < BATCH_SIZE) continue;

    await Payout.bulkWrite(operations, { ordered: false });
    migratedCount += operations.length;
    operations = [];
  }

  if (operations.length) {
    await Payout.bulkWrite(operations, { ordered: false });
    migratedCount += operations.length;
  }

  console.info(`Upserted ${migratedCount} approved payout records`);
}

migratePayoutRecords()
  .catch((error) => {
    console.error("Payout record migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

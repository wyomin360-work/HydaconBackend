require("dotenv").config();
const mongoose = require("mongoose");
const { WITHDRAWAL_STATUS } = require("../src/constants/withdrawals");
const {
  PAYOUT_PROVIDER,
  PAYOUT_OUTBOX_STATUS,
} = require("../src/constants/payouts");

const COLLECTION_RENAMES = [
  ["razorpaypayoutattempts", "payoutattempts"],
  ["razorpaywebhookevents", "payoutevents"],
  ["razorpayreconciliations", "payoutrecons"],
  ["financialledgerentries", "ledgerentries"],
];

const FIELD_RENAMES = [
  ["users", "razorpayContactId", "payoutContactId"],
  ["userbankaccounts", "razorpayFundAccountId", "payoutFundAccountId"],
  ["withdrawals", "razorpayPayoutId", "providerPayoutId"],
  ["withdrawals", "providerPayoutId", "providerTransferId"],
  ["withdrawals", "lastRazorpayReconciledAt", "lastPayoutReconciledAt"],
  ["payoutattempts", "payoutId", "providerTransferId"],
  ["payoutattempts", "fundAccountId", "providerBeneficiaryId"],
  ["payoutevents", "payoutId", "providerTransferId"],
  ["payoutevents", "referenceId", "providerReferenceId"],
  ["payoutrecons", "payoutId", "providerTransferId"],
  ["ledgerentries", "payoutId", "providerTransferId"],
];

async function collectionExists(db, name) {
  return Boolean(await db.listCollections({ name }).hasNext());
}

async function migratePayoutContract() {
  validateMigrationConfig();
  await mongoose.connect(process.env.MONGODB_URL);
  const db = mongoose.connection.db;

  await assertSafeToRename(db);
  await renameLegacyCollections(db);
  await renameLegacyFields(db);
  await backfillLegacyProviderData(db);
  await createOutboxesForRecoverableWithdrawals(db);
  await migrateLegacyLedgerSources(db);
}

function validateMigrationConfig() {
  if (!process.env.MONGODB_URL) {
    throw new Error("MONGODB_URL is required to migrate payout records");
  }
}

async function assertSafeToRename(db) {
  await assertNoFieldRenameConflicts(db);
  await assertNoCollectionRenameConflicts(db);
}

async function assertNoFieldRenameConflicts(db) {
  for (const [collection, oldField, newField] of FIELD_RENAMES) {
    const conflict = await db
      .collection(collection)
      .findOne(
        { [oldField]: { $exists: true }, [newField]: { $exists: true } },
        { projection: { _id: 1 } },
      );
    if (!conflict) continue;

    throw new Error(
      `Both ${oldField} and ${newField} exist on ${collection} record ${conflict._id}`,
    );
  }
}

async function assertNoCollectionRenameConflicts(db) {
  for (const [oldName, newName] of COLLECTION_RENAMES) {
    const [oldExists, newExists] = await Promise.all([
      collectionExists(db, oldName),
      collectionExists(db, newName),
    ]);
    if (oldExists && newExists) {
      throw new Error(
        `Both ${oldName} and ${newName} exist; reconcile them before continuing`,
      );
    }
  }
}

async function renameLegacyCollections(db) {
  for (const [oldName, newName] of COLLECTION_RENAMES) {
    if (!(await collectionExists(db, oldName))) continue;
    await db.collection(oldName).rename(newName);
    console.info(`Renamed payout audit collection ${oldName} to ${newName}`);
  }
}

async function renameLegacyFields(db) {
  for (const [collection, oldField, newField] of FIELD_RENAMES) {
    const result = await db
      .collection(collection)
      .updateMany(
        { [oldField]: { $exists: true }, [newField]: { $exists: false } },
        { $rename: { [oldField]: newField } },
      );
    if (result.modifiedCount) {
      console.info(
        `Renamed ${oldField} to ${newField} on ${result.modifiedCount} ${collection} records`,
      );
    }
  }
}

async function backfillLegacyProviderData(db) {
  await backfillWithdrawalProvider(db);
  await backfillAuditProviders(db);
  await backfillBeneficiaryRecords(db);
  await backfillProviderReferences(db);
}

async function backfillWithdrawalProvider(db) {
  await db.collection("withdrawals").updateMany(
    {
      payoutProvider: { $in: [null] },
      $or: [
        { providerTransferId: { $exists: true, $ne: null } },
        {
          status: {
            $in: [
              WITHDRAWAL_STATUS.PROCESSING,
              WITHDRAWAL_STATUS.COMPLETED,
              WITHDRAWAL_STATUS.FAILED,
              WITHDRAWAL_STATUS.REVERSED,
            ],
          },
          approvedAt: { $ne: null },
        },
      ],
    },
    { $set: { payoutProvider: PAYOUT_PROVIDER.RAZORPAYX } },
  );
}

async function backfillAuditProviders(db) {
  for (const collection of ["payoutattempts", "payoutevents", "payoutrecons"]) {
    await db
      .collection(collection)
      .updateMany(
        { provider: { $exists: false } },
        { $set: { provider: PAYOUT_PROVIDER.RAZORPAYX } },
      );
  }
}

async function backfillBeneficiaryRecords(db) {
  await db.collection("userbankaccounts").updateMany(
    {
      payoutFundAccountId: { $exists: true, $ne: null },
      providerBeneficiaries: { $exists: false },
    },
    [
      {
        $set: {
          providerBeneficiaries: [
            {
              provider: PAYOUT_PROVIDER.RAZORPAYX,
              beneficiaryId: "$payoutFundAccountId",
              providerData: {},
              accountFingerprint: null,
            },
          ],
        },
      },
    ],
  );
}

async function backfillProviderReferences(db) {
  await db.collection("payoutrecons").updateMany(
    {
      providerReferenceId: { $exists: false },
      referenceId: { $exists: true },
    },
    [{ $set: { providerReferenceId: "$referenceId" } }],
  );
  await db.collection("withdrawals").updateMany(
    {
      payoutProvider: { $exists: true, $ne: null },
      providerReferenceId: { $exists: false },
    },
    [{ $set: { providerReferenceId: { $toString: "$_id" } } }],
  );
}

async function createOutboxesForRecoverableWithdrawals(db) {
  const recoverable = await db
    .collection("withdrawals")
    .find({
      status: WITHDRAWAL_STATUS.PROCESSING,
      payoutProvider: {
        $in: [PAYOUT_PROVIDER.RAZORPAYX, PAYOUT_PROVIDER.CASHFREE],
      },
      providerTransferId: null,
      providerReferenceId: { $exists: true, $ne: null },
    })
    .project({ _id: 1, payoutProvider: 1, providerReferenceId: 1 })
    .toArray();
  if (!recoverable.length) return;

  await db.collection("payoutoutboxes").bulkWrite(
    recoverable.map((withdrawal) => ({
      updateOne: {
        filter: { withdrawalId: withdrawal._id },
        update: {
          $setOnInsert: {
            withdrawalId: withdrawal._id,
            provider: withdrawal.payoutProvider,
            providerReferenceId: withdrawal.providerReferenceId,
            status: PAYOUT_OUTBOX_STATUS.PENDING,
            attempts: 0,
            availableAt: new Date(),
            leaseExpiresAt: null,
          },
        },
        upsert: true,
      },
    })),
  );
}

async function migrateLegacyLedgerSources(db) {
  const ledger = db.collection("ledgerentries");
  const sourceRenames = [
    ["RAZORPAY_WEBHOOK", "PAYOUT_WEBHOOK"],
    ["RAZORPAY_RECONCILIATION", "PAYOUT_RECONCILIATION"],
  ];
  for (const [oldSource, newSource] of sourceRenames) {
    await ledger.updateMany(
      { source: oldSource },
      { $set: { source: newSource } },
    );
  }
}

migratePayoutContract()
  .catch((error) => {
    console.error("Payout contract migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

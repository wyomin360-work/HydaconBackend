require("dotenv").config();
const mongoose = require("mongoose");

const collectionRenames = [
  ["razorpaypayoutattempts", "payoutattempts"],
  ["razorpaywebhookevents", "payoutevents"],
  ["razorpayreconciliations", "payoutrecons"],
  ["financialledgerentries", "ledgerentries"],
];

async function collectionExists(db, name) {
  return Boolean(await db.listCollections({ name }).hasNext());
}

async function migratePayoutContract() {
  if (!process.env.MONGODB_URL) {
    throw new Error("MONGODB_URL is required to migrate payout records");
  }
  await mongoose.connect(process.env.MONGODB_URL);
  const db = mongoose.connection.db;

  const fieldRenames = [
    ["users", "razorpayContactId", "payoutContactId"],
    ["userbankaccounts", "razorpayFundAccountId", "payoutFundAccountId"],
    ["withdrawals", "razorpayPayoutId", "providerPayoutId"],
    ["withdrawals", "lastRazorpayReconciledAt", "lastPayoutReconciledAt"],
  ];
  for (const [collection, oldField, newField] of fieldRenames) {
    const conflict = await db
      .collection(collection)
      .findOne(
        { [oldField]: { $exists: true }, [newField]: { $exists: true } },
        { projection: { _id: 1 } },
      );
    if (conflict) {
      throw new Error(
        `Both ${oldField} and ${newField} exist on ${collection} record ${conflict._id}`,
      );
    }
  }

  for (const [oldName, newName] of collectionRenames) {
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

  for (const [oldName, newName] of collectionRenames) {
    const oldExists = await collectionExists(db, oldName);
    if (oldExists) {
      await db.collection(oldName).rename(newName);
      console.info(`Renamed payout audit collection ${oldName} to ${newName}`);
    }
  }

  for (const [collection, oldField, newField] of fieldRenames) {
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

  const ledger = db.collection("ledgerentries");
  for (const [oldSource, newSource] of [
    ["RAZORPAY_WEBHOOK", "PAYOUT_WEBHOOK"],
    ["RAZORPAY_RECONCILIATION", "PAYOUT_RECONCILIATION"],
  ]) {
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

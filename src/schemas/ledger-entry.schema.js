const mongoose = require("mongoose");
const {
  PAYOUT_LEDGER_MOVEMENT_VALUES,
  PAYOUT_ASSET_VALUES,
  PAYOUT_LEDGER_SOURCE_VALUES,
} = require("../constants/payouts");

const ledgerEntrySchema = new mongoose.Schema(
  {
    entryKey: { type: String, required: true, unique: true, immutable: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true,
    },
    withdrawalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Withdrawal",
      required: true,
      index: true,
      immutable: true,
    },
    providerTransferId: { type: String, default: null, immutable: true },
    payoutId: { type: String, default: null, immutable: true },
    movement: {
      type: String,
      enum: PAYOUT_LEDGER_MOVEMENT_VALUES,
      required: true,
      immutable: true,
    },
    asset: {
      type: String,
      enum: PAYOUT_ASSET_VALUES,
      required: true,
      immutable: true,
    },
    amount: { type: Number, required: true, min: 0, immutable: true },
    balanceBefore: { type: Number, required: true, immutable: true },
    balanceAfter: { type: Number, required: true, immutable: true },
    source: {
      type: String,
      enum: PAYOUT_LEDGER_SOURCE_VALUES,
      required: true,
      immutable: true,
    },
    sourceId: { type: String, default: null, immutable: true },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      immutable: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

ledgerEntrySchema.index({ userId: 1, createdAt: -1 });
ledgerEntrySchema.index({ withdrawalId: 1, createdAt: 1 });

module.exports = mongoose.model("LedgerEntry", ledgerEntrySchema);

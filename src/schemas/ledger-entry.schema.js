const mongoose = require("mongoose");

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
    payoutId: { type: String, default: null, immutable: true },
    movement: {
      type: String,
      enum: [
        "WITHDRAWAL_COIN_DEBIT",
        "WITHDRAWAL_COIN_REFUND",
        "PAYOUT_COMPLETED",
      ],
      required: true,
      immutable: true,
    },
    asset: {
      type: String,
      enum: ["HYDACON_COIN", "INR"],
      required: true,
      immutable: true,
    },
    amount: { type: Number, required: true, min: 0, immutable: true },
    balanceBefore: { type: Number, required: true, immutable: true },
    balanceAfter: { type: Number, required: true, immutable: true },
    source: {
      type: String,
      enum: [
        "USER_REQUEST",
        "ADMIN_CANCELLATION",
        "PAYOUT_WEBHOOK",
        "PAYOUT_RECONCILIATION",
      ],
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

module.exports = mongoose.model(
  "LedgerEntry",
  ledgerEntrySchema,
);

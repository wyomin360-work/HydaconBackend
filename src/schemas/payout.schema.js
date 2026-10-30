const mongoose = require("mongoose");
const {
  WITHDRAWAL_STATUS,
  WITHDRAWAL_POINT_ROUNDING_MODE,
} = require("../constants/withdrawals");
const {
  PAYOUT_PROVIDER_VALUES,
  PAYOUT_APPROVAL_SOURCE_VALUES,
} = require("../constants/payouts");

const pointConversionSnapshotSchema = new mongoose.Schema(
  {
    rateInrPerPoint: { type: Number, min: 0 },
    roundingMode: {
      type: String,
      enum: Object.values(WITHDRAWAL_POINT_ROUNDING_MODE),
    },
  },
  { _id: false },
);

const payoutSchema = new mongoose.Schema(
  {
    // Keep the payout ID stable and idempotent across retries of one withdrawal.
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Withdrawal",
      required: true,
    },
    withdrawalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Withdrawal",
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserBankAccount",
      required: true,
    },
    withdrawalCreatedAt: { type: Date, required: true },
    cashAmount: { type: Number, required: true, min: 0 },
    pointsAmount: { type: Number, min: 0, default: null },
    coinAmount: { type: Number, min: 0, default: null },
    pointConversionSnapshot: {
      type: pointConversionSnapshotSchema,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(WITHDRAWAL_STATUS),
      index: true,
    },
    payoutProvider: {
      type: String,
      enum: PAYOUT_PROVIDER_VALUES,
      required: true,
      index: true,
    },
    payoutBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PayoutBatch",
      default: null,
    },
    providerReferenceId: { type: String, required: true, index: true },
    providerTransferId: { type: String, default: null, index: true },
    utr: { type: String, default: null },
    approvalSource: {
      type: String,
      enum: PAYOUT_APPROVAL_SOURCE_VALUES,
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    approvedAt: { type: Date, required: true },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    cancelledAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
    remarks: { type: String, default: null },
  },
  { timestamps: true },
);

payoutSchema.index({ status: 1, createdAt: -1 });
payoutSchema.index({ payoutProvider: 1, providerTransferId: 1 });

module.exports = mongoose.model("Payout", payoutSchema);

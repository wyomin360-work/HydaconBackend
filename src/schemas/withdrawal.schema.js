const mongoose = require("mongoose");
const { WITHDRAWAL_STATUS } = require("../constants/withdrawals");
const {
  PAYOUT_PROVIDER_VALUES,
  PAYOUT_APPROVAL_SOURCE_VALUES,
} = require("../constants/payouts");

const withdrawalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // New withdrawals debit reward points. coinAmount remains for legacy
    // withdrawals created before the balance asset was corrected.
    pointsAmount: { type: Number, min: 0, default: null },
    coinAmount: { type: Number, min: 0, default: null },
    cashAmount: { type: Number, required: true },
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserBankAccount",
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(WITHDRAWAL_STATUS),
      default: WITHDRAWAL_STATUS.PENDING,
      index: true,
    },
    payoutProvider: {
      type: String,
      enum: PAYOUT_PROVIDER_VALUES,
      default: null,
      index: true,
    },
    payoutBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PayoutBatch",
      default: null,
    },
    providerReferenceId: { type: String, default: null, index: true },
    providerTransferId: { type: String, default: null, index: true },
    payoutAttemptCount: { type: Number, default: 0, min: 0 },
    lastPayoutReconciledAt: { type: Date, default: null },
    utr: { type: String, default: null },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    approvedAt: { type: Date, default: null },
    approvalSource: {
      type: String,
      enum: PAYOUT_APPROVAL_SOURCE_VALUES,
      default: null,
    },
    completedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
    remarks: { type: String, default: null },
  },
  { timestamps: true },
);

withdrawalSchema.set("toJSON", { virtuals: true });
withdrawalSchema.set("toObject", { virtuals: true });

withdrawalSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

withdrawalSchema.virtual("bankAccount", {
  ref: "UserBankAccount",
  localField: "bankAccountId",
  foreignField: "_id",
  justOne: true,
});

withdrawalSchema.virtual("approver", {
  ref: "Admin",
  localField: "approvedBy",
  foreignField: "_id",
  justOne: true,
});

withdrawalSchema.index({
  payoutBatchId: 1,
  status: 1,
  payoutProvider: 1,
  approvedAt: 1,
});

const Withdrawal = mongoose.model("Withdrawal", withdrawalSchema);

module.exports = Withdrawal;

const mongoose = require("mongoose");

const withdrawalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    coinAmount: { type: Number, required: true },
    cashAmount: { type: Number, required: true },
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserBankAccount",
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED", "REVERSED"],
      default: "PENDING",
      index: true,
    },
    razorpayPayoutId: { type: String, default: null, index: true },
    utr: { type: String, default: null },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    approvedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
    remarks: { type: String, default: null },
  },
  { timestamps: true }
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

const Withdrawal = mongoose.model("Withdrawal", withdrawalSchema);

module.exports = Withdrawal;

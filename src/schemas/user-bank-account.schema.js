const mongoose = require("mongoose");

const userBankAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accountHolderName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountIv: { type: String, required: true },
    ifscCode: { type: String, required: true },
    ifscIv: { type: String, required: true },
    bankName: { type: String, required: true },
    branchName: { type: String, required: true },
    razorpayFundAccountId: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userBankAccountSchema.set("toJSON", { virtuals: true });
userBankAccountSchema.set("toObject", { virtuals: true });

userBankAccountSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

const UserBankAccount = mongoose.model(
  "UserBankAccount",
  userBankAccountSchema,
);

module.exports = UserBankAccount;

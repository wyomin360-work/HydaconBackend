const mongoose = require("mongoose");
const { PAYOUT_PROVIDER_VALUES } = require("../constants/payouts");

const providerBeneficiaryDataSchema = new mongoose.Schema(
  { contactId: { type: String, default: null } },
  { _id: false },
);

const providerBeneficiarySchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: PAYOUT_PROVIDER_VALUES,
      required: true,
    },
    beneficiaryId: { type: String, required: true },
    providerData: {
      type: providerBeneficiaryDataSchema,
      default: () => ({}),
    },
    accountFingerprint: { type: String, default: null },
  },
  { _id: false },
);

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
    payoutFundAccountId: { type: String, default: null },
    providerBeneficiaries: { type: [providerBeneficiarySchema], default: [] },
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

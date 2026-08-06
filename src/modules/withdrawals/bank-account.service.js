const UserBankAccount = require("../../schemas/user-bank-account.schema");
const User = require("../../schemas/user.schema");
const { encrypt, decrypt } = require("../../utils/encryption");
const { validateIFSC } = require("../../functions/razorPay");
const { sendFailResponse } = require("../../utils/responseHandlers");

/**
 * Configure user bank account.
 */
async function configureBankAccount(userId, data) {
  const { accountHolderName, accountNumber, confirmAccountNumber, ifscCode } = data;

  if (!accountHolderName || !accountNumber || !confirmAccountNumber || !ifscCode) {
    sendFailResponse("All bank account fields are required");
  }

  if (accountNumber !== confirmAccountNumber) {
    sendFailResponse("Account numbers do not match");
  }

  // Validate IFSC code
  const bankInfo = await validateIFSC(ifscCode);
  if (!bankInfo) {
    sendFailResponse("Invalid IFSC Code");
  }

  // Check if user exists
  const user = await User.findById(userId);
  if (!user) {
    sendFailResponse("User not found");
  }

  // Encrypt sensitive details
  const encryptedAccountNumber = encrypt(accountNumber);
  const encryptedIfscCode = encrypt(ifscCode);

  if (!encryptedAccountNumber || !encryptedIfscCode) {
    sendFailResponse("Unable to process bank details. Please try again.");
  }

  // Deactivate any existing active bank account for this user
  await UserBankAccount.updateMany(
    { userId, isActive: true },
    { isActive: false }
  );

  // Save new bank account
  const bankAccount = await UserBankAccount.create({
    userId,
    accountHolderName,
    accountNumber: encryptedAccountNumber.encryptedData,
    accountIv: encryptedAccountNumber.iv,
    ifscCode: encryptedIfscCode.encryptedData,
    ifscIv: encryptedIfscCode.iv,
    bankName: bankInfo?.BANK || "Unknown Bank",
    branchName: bankInfo?.BRANCH || "Unknown Branch",
    isActive: true,
  });

  return {
    message: "Bank account configured successfully",
    data: {
      bankAccountId: bankAccount._id,
      bankName: bankAccount.bankName,
      branchName: bankAccount.branchName,
    },
  };
}

/**
 * Retrieve user's active bank account.
 */
async function getBankAccount(userId) {
  const bankAccount = await UserBankAccount.findOne({ userId, isActive: true }).lean();
  if (!bankAccount) {
    sendFailResponse("Bank account not configured");
  }

  const accountNumber = decrypt(bankAccount.accountNumber, bankAccount.accountIv);
  const ifscCode = decrypt(bankAccount.ifscCode, bankAccount.ifscIv);

  if (!accountNumber || !ifscCode) {
    sendFailResponse("Unable to retrieve bank account details");
  }

  return {
    id: bankAccount._id,
    accountHolderName: bankAccount.accountHolderName,
    accountNumber,
    ifscCode,
    bankName: bankAccount.bankName,
    branchName: bankAccount.branchName,
    razorpayFundAccountId: bankAccount.razorpayFundAccountId,
  };
}

module.exports = {
  configureBankAccount,
  getBankAccount,
};

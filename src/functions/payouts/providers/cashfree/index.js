const crypto = require("crypto");
const api = require("./api");
const webhook = require("./webhook");
const mapping = require("./mapping");
const {
  PAYOUT_PROVIDER,
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
  PAYOUT_TRANSFER_MODE,
} = require("../../../../constants/payouts");

function beneficiaryIdFor(bankAccountId, bankDetails) {
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${bankDetails.accountNumber}|${bankDetails.ifscCode}`)
    .digest("hex");
  return `${PAYOUT_CONFIG.CASHFREE_BENEFICIARY_ID_PREFIX}${String(
    bankAccountId,
  ).replace(/[^a-zA-Z0-9_.-]/g, "")}_${fingerprint.slice(
    0,
    PAYOUT_CONFIG.CASHFREE_BENEFICIARY_ID_HASH_LENGTH,
  )}`.slice(0, PAYOUT_CONFIG.CASHFREE_BENEFICIARY_ID_MAX_LENGTH);
}

function normalizePhoneNumber(phone) {
  const digits = String(phone).replace(/\D/g, "");
  const hasCountryPrefix =
    digits.length === PAYOUT_CONFIG.CASHFREE_INTERNATIONAL_PHONE_LENGTH &&
    digits.startsWith(PAYOUT_CONFIG.CASHFREE_PHONE_COUNTRY_PREFIX);
  return hasCountryPrefix
    ? digits.slice(PAYOUT_CONFIG.CASHFREE_PHONE_COUNTRY_PREFIX.length)
    : digits;
}

function makeBeneficiaryPayload(user, bankDetails, beneficiaryId) {
  return {
    beneficiary_id: beneficiaryId,
    beneficiary_name: bankDetails.accountHolderName,
    beneficiary_instrument_details: {
      bank_account_number: bankDetails.accountNumber,
      bank_ifsc: bankDetails.ifscCode,
    },
    beneficiary_contact_details: {
      ...(user.email ? { beneficiary_email: user.email } : {}),
      ...(user.phone
        ? { beneficiary_phone: normalizePhoneNumber(user.phone) }
        : {}),
      beneficiary_country_code: PAYOUT_CONFIG.CASHFREE_COUNTRY_CODE,
    },
  };
}

function makeTransferPayload(transfer) {
  return {
    transfer_id: transfer.referenceId,
    transfer_amount: transfer.amountMinor / PAYOUT_CONFIG.MINOR_UNITS_PER_INR,
    transfer_mode: String(
      transfer.mode || PAYOUT_TRANSFER_MODE.IMPS,
    ).toLowerCase(),
    transfer_remarks: (
      transfer.narration || PAYOUT_CONFIG.CASHFREE_TRANSFER_REMARKS_DEFAULT
    ).slice(0, PAYOUT_CONFIG.CASHFREE_TRANSFER_REMARKS_MAX_LENGTH),
    beneficiary_details: { beneficiary_id: transfer.beneficiaryId },
  };
}

async function createBeneficiary({
  user,
  bankAccount,
  bankDetails,
  existing = {},
}) {
  const id =
    existing.beneficiaryId || beneficiaryIdFor(bankAccount._id, bankDetails);
  const current = await api.getBeneficiary(id);
  if (current?.beneficiary_id) return { beneficiaryId: current.beneficiary_id };
  const payload = makeBeneficiaryPayload(user, bankDetails, id);
  const result = await api.createBeneficiary(payload, id);
  if (!result?.beneficiary_id) {
    const error = new Error(PAYOUT_MESSAGE.CASHFREE_BENEFICIARY_ID_MISSING);
    error.definitive = true;
    throw error;
  }
  return { beneficiaryId: result.beneficiary_id };
}

async function initiateTransfer(input) {
  const transfer = await api.createTransfer(makeTransferPayload(input));
  const normalized = mapping.normalizeTransferResponse(transfer);
  return { ...normalized, httpStatus: transfer._httpStatus || null };
}

async function getTransferStatus({ referenceId }) {
  const transfer = await api.fetchTransferByReference(referenceId);
  return transfer ? mapping.normalizeTransferResponse(transfer) : null;
}

async function initiateBatchTransfer({ batchReferenceId, transfers }) {
  const result = await api.createBatchTransfer({
    batch_transfer_id: batchReferenceId,
    transfers: transfers.map(makeTransferPayload),
  });
  return mapping.normalizeBatchTransferResponse(result);
}

async function getBatchTransferStatus({ batchReferenceId }) {
  const result = await api.fetchBatchTransferByReference(batchReferenceId);
  return result ? mapping.normalizeBatchTransferResponse(result) : null;
}

function createIdempotencyKey(referenceId) {
  return crypto.createHash("sha256").update(String(referenceId)).digest("hex");
}

module.exports = {
  id: PAYOUT_PROVIDER.CASHFREE,
  createBeneficiary,
  initiateTransfer,
  getTransferStatus,
  initiateBatchTransfer,
  getBatchTransferStatus,
  verifyWebhook: webhook.verifyWebhook,
  normalizeWebhook: mapping.normalizeWebhook,
  createIdempotencyKey,
  validateConfig: api.validateConfig,
};

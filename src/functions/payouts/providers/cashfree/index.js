const crypto = require("crypto");
const api = require("./api");
const webhook = require("./webhook");
const mapping = require("./mapping");
const { PAYOUT_PROVIDER } = require("../../../../constants/payouts");

function beneficiaryIdFor(bankAccountId, bankDetails) {
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${bankDetails.accountNumber}|${bankDetails.ifscCode}`)
    .digest("hex");
  return `hydacon_${String(bankAccountId).replace(/[^a-zA-Z0-9_.-]/g, "")}_${fingerprint.slice(0, 20)}`.slice(
    0,
    50,
  );
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
  const payload = {
    beneficiary_id: id,
    beneficiary_name: bankDetails.accountHolderName,
    beneficiary_instrument_details: {
      bank_account_number: bankDetails.accountNumber,
      bank_ifsc: bankDetails.ifscCode,
    },
    beneficiary_contact_details: {
      ...(user.email ? { beneficiary_email: user.email } : {}),
      ...(user.phone
        ? {
            beneficiary_phone: (() => {
              const digits = String(user.phone).replace(/\D/g, "");
              return digits.length === 12 && digits.startsWith("91")
                ? digits.slice(2)
                : digits;
            })(),
          }
        : {}),
      beneficiary_country_code: "+91",
    },
  };
  const result = await api.createBeneficiary(payload, id);
  if (!result?.beneficiary_id)
    throw new Error("Cashfree did not return a beneficiary ID");
  return { beneficiaryId: result.beneficiary_id };
}

async function initiateTransfer(input) {
  const transfer = await api.createTransfer({
    transfer_id: input.referenceId,
    transfer_amount: input.amountMinor / 100,
    transfer_mode: String(input.mode || "imps").toLowerCase(),
    transfer_remarks: (input.narration || "Hydacon Payout").slice(0, 70),
    beneficiary_details: { beneficiary_id: input.beneficiaryId },
  });
  const normalized = mapping.normalizeTransferResponse(transfer);
  return { ...normalized, httpStatus: transfer._httpStatus || null };
}

async function getTransferStatus({ referenceId }) {
  const transfer = await api.fetchTransferByReference(referenceId);
  return transfer ? mapping.normalizeTransferResponse(transfer) : null;
}

function createIdempotencyKey(referenceId) {
  return crypto.createHash("sha256").update(String(referenceId)).digest("hex");
}

module.exports = {
  id: PAYOUT_PROVIDER.CASHFREE,
  createBeneficiary,
  initiateTransfer,
  getTransferStatus,
  verifyWebhook: webhook.verifyWebhook,
  normalizeWebhook: mapping.normalizeWebhook,
  createIdempotencyKey,
  validateConfig: api.validateConfig,
};

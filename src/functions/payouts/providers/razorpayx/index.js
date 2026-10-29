const api = require("./api");
const webhook = require("./webhook");
const mapping = require("./mapping");
const { PAYOUT_PROVIDER } = require("../../../../constants/payouts");

async function createBeneficiary({ user, bankDetails, existing = {} }) {
  let contactId =
    existing.contactId || existing.providerData?.contactId || null;
  let fundAccountId = existing.beneficiaryId || null;
  if (!contactId) {
    const contact = await api.createContact(user);
    if (!contact?.id) throw new Error("RazorpayX did not return a contact ID");
    contactId = contact.id;
  }
  if (!fundAccountId) {
    const fundAccount = await api.createFundAccount(contactId, bankDetails);
    if (!fundAccount?.id)
      throw new Error("RazorpayX did not return a fund account ID");
    fundAccountId = fundAccount.id;
  }
  return { beneficiaryId: fundAccountId, providerData: { contactId } };
}

async function initiateTransfer(input) {
  const beneficiaryId = input.beneficiaryId || input.fundAccountId;
  const transfer = await api.createTransfer({ ...input, beneficiaryId });
  const normalized = mapping.normalizeTransferResponse(transfer);
  return {
    ...normalized,
    httpStatus: transfer._httpStatus || null,
    safeResponse: normalized.safeResponse,
  };
}

async function getTransferStatus({ referenceId }) {
  const transfer = await api.fetchTransferByReference(referenceId);
  return transfer ? mapping.normalizeTransferResponse(transfer) : null;
}

module.exports = {
  id: PAYOUT_PROVIDER.RAZORPAYX,
  createBeneficiary,
  initiateTransfer,
  getTransferStatus,
  verifyWebhook: webhook.verifyWebhook,
  normalizeWebhook: mapping.normalizeWebhook,
  createIdempotencyKey: api.createIdempotencyKey,
  validateConfig: api.validateConfig,
  // Backward-compatible provider API aliases for existing integrations/tests.
  createPayoutContact: api.createContact,
  createPayoutFundAccount: api.createFundAccount,
  createPayout: (fundAccountId, amount, referenceId, narration) =>
    api.createTransfer({
      beneficiaryId: fundAccountId,
      amountMinor: amount,
      referenceId,
      narration,
      idempotencyKey: api.createIdempotencyKey(referenceId),
    }),
  fetchPayoutByReference: api.fetchTransferByReference,
  verifyPayoutWebhook: webhook.verifyWebhook,
};

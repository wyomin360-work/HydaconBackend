const { PAYOUT_CONFIG, PAYOUT_CURRENCY } = require("../../constants/payouts");
const PayoutRecon = require("../../schemas/payout-recon.schema");
const { safeText } = require("./payout-utils");

function hasTransferMismatch(withdrawal, transfer) {
  const expectedAmount = Math.round(
    withdrawal.cashAmount * PAYOUT_CONFIG.MINOR_UNITS_PER_INR,
  );
  const referenceMismatch =
    transfer.providerReferenceId &&
    transfer.providerReferenceId !== withdrawal.providerReferenceId;
  const transferIdMismatch =
    transfer.providerTransferId &&
    withdrawal.providerTransferId &&
    transfer.providerTransferId !== withdrawal.providerTransferId;
  const amountMismatch =
    transfer.amountMinor != null &&
    Number(transfer.amountMinor) !== expectedAmount;
  const currencyMismatch =
    transfer.currency && transfer.currency !== PAYOUT_CURRENCY.INR;

  if (
    referenceMismatch ||
    transferIdMismatch ||
    amountMismatch ||
    currencyMismatch
  ) {
    return true;
  }
  return false;
}

async function recordPayoutReconciliation({
  withdrawal,
  requestedAt = new Date(),
  outcome,
  transfer = null,
  errorMessage = null,
}) {
  return PayoutRecon.create({
    withdrawalId: withdrawal._id,
    provider: withdrawal.payoutProvider,
    providerTransferId: transfer?.providerTransferId || null,
    payoutId: transfer?.providerTransferId || null,
    providerReferenceId: withdrawal.providerReferenceId,
    referenceId: withdrawal.providerReferenceId,
    requestedAt,
    outcome,
    providerStatus: transfer?.rawStatus || transfer?.status || null,
    providerResponse: transfer?.safeResponse || {},
    errorMessage: errorMessage ? safeText(errorMessage) : null,
  });
}

module.exports = { hasTransferMismatch, recordPayoutReconciliation };

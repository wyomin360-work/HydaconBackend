const { PAYOUT_PROVIDER, PAYOUT_MESSAGE } = require("../../constants/payouts");

const providers = {
  [PAYOUT_PROVIDER.RAZORPAYX]: () => require("../razorpayx"),
  [PAYOUT_PROVIDER.CASHFREE]: () => require("./providers/cashfree"),
};

function normalizeProviderName(name) {
  const provider = String(
    name || process.env.PAYOUT_PROVIDER || PAYOUT_PROVIDER.RAZORPAYX,
  )
    .trim()
    .toLowerCase();
  if (!providers[provider]) {
    const error = new Error(
      `${PAYOUT_MESSAGE.UNSUPPORTED_PROVIDER}: ${provider}`,
    );
    error.definitive = true;
    throw error;
  }
  return provider;
}

function getProvider(name) {
  const providerName = normalizeProviderName(name);
  const provider = providers[providerName]();
  return { ...provider, id: provider.id || providerName };
}

function currentProviderName() {
  return normalizeProviderName();
}

module.exports = { getProvider, currentProviderName, normalizeProviderName };

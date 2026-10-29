const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const logger = require("../../../../config/pino.config");
const {
  PAYOUT_MESSAGE,
  PAYOUT_PROVIDER_ENVIRONMENT,
} = require("../../../../constants/payouts");

const API_VERSION = process.env.CASHFREE_PAYOUT_API_VERSION || "2024-01-01";
const TIMEOUT_MS = Number(process.env.CASHFREE_PAYOUT_TIMEOUT_MS || 15000);

function getBaseUrl() {
  return process.env.CASHFREE_PAYOUT_ENV === PAYOUT_PROVIDER_ENVIRONMENT.PRODUCTION
    ? "https://api.cashfree.com/payout"
    : "https://sandbox.cashfree.com/payout";
}

function validateConfig() {
  if (
    !process.env.CASHFREE_PAYOUT_CLIENT_ID ||
    !process.env.CASHFREE_PAYOUT_CLIENT_SECRET
  ) {
    throw new Error(
      PAYOUT_MESSAGE.PROVIDER_CREDENTIALS_MISSING("Cashfree Payouts"),
    );
  }
  const environment =
    process.env.CASHFREE_PAYOUT_ENV || PAYOUT_PROVIDER_ENVIRONMENT.SANDBOX;
  if (!Object.values(PAYOUT_PROVIDER_ENVIRONMENT).includes(environment)) {
    throw new Error(PAYOUT_MESSAGE.PROVIDER_ENV_INVALID);
  }
}

function publicKey() {
  if (process.env.CASHFREE_PAYOUT_PUBLIC_KEY) {
    return process.env.CASHFREE_PAYOUT_PUBLIC_KEY.replace(/\\n/g, "\n");
  }
  const keyPath = process.env.CASHFREE_PAYOUT_PUBLIC_KEY_PATH;
  return keyPath ? fs.readFileSync(keyPath, "utf8") : null;
}

function createCfSignature(clientId, pem) {
  const input = `${clientId}.${Math.floor(Date.now() / 1000)}`;
  return crypto
    .publicEncrypt(
      {
        key: pem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha1",
      },
      Buffer.from(input),
    )
    .toString("base64");
}

function requestHeaders(requestId = crypto.randomUUID()) {
  const clientId = process.env.CASHFREE_PAYOUT_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_PAYOUT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const error = new Error(
      PAYOUT_MESSAGE.PROVIDER_CREDENTIALS_MISSING("Cashfree Payouts"),
    );
    error.definitive = true;
    throw error;
  }
  const headers = {
    "Content-Type": "application/json",
    "x-api-version": API_VERSION,
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
    "x-request-id": requestId,
  };
  const pem = publicKey();
  if (pem) headers["x-cf-signature"] = createCfSignature(clientId, pem);
  return headers;
}

function wrapError(error, fallback) {
  const statusCode = error?.response?.status || null;
  const body = error?.response?.data || {};
  const message = body.message || error?.message || fallback;
  const wrapped = new Error(
    String(message)
      .replace(/\d{6,}/g, "[redacted]")
      .slice(0, 500),
  );
  wrapped.providerStatusCode = statusCode;
  wrapped.providerErrorCode = body.subCode || body.code || null;
  // 5xx, timeouts, and connection failures are ambiguous: the transfer may exist.
  wrapped.definitive = Boolean(
    statusCode >= 400 && statusCode < 500 && statusCode !== 409,
  );
  wrapped.ambiguous = !wrapped.definitive;
  return wrapped;
}

async function call(method, path, { data, params, requestId } = {}) {
  try {
    return await axios({
      method,
      url: `${getBaseUrl()}${path}`,
      headers: requestHeaders(requestId),
      timeout: TIMEOUT_MS,
      data,
      params,
    });
  } catch (error) {
    throw wrapError(error, `Cashfree Payouts ${method} ${path} failed`);
  }
}

async function getBeneficiary(beneficiaryId) {
  try {
    const response = await call("GET", "/beneficiary", {
      params: { beneficiary_id: beneficiaryId },
    });
    return response.data;
  } catch (error) {
    if (error.providerStatusCode === 404) return null;
    throw error;
  }
}

async function createBeneficiary(payload, beneficiaryId) {
  const response = await call("POST", "/beneficiary", {
    data: payload,
    requestId: `bene-${beneficiaryId}`.slice(0, 50),
  });
  return response.data;
}

async function createTransfer(payload) {
  const response = await call("POST", "/transfers", {
    data: payload,
    requestId: `transfer-${payload.transfer_id}`.slice(0, 50),
  });
  return { ...response.data, _httpStatus: response.status };
}

async function fetchTransferByReference(referenceId) {
  try {
    const response = await call("GET", "/transfers", {
      params: { transfer_id: referenceId },
      requestId: `status-${referenceId}`.slice(0, 50),
    });
    return { ...response.data, _httpStatus: response.status };
  } catch (error) {
    if (error.providerStatusCode === 404) return null;
    throw error;
  }
}

module.exports = {
  validateConfig,
  getBeneficiary,
  createBeneficiary,
  createTransfer,
  fetchTransferByReference,
};

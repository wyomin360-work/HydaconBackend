const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const logger = require("../../../../config/pino.config");
const {
  PAYOUT_MESSAGE,
  PAYOUT_HTTP_STATUS,
  PAYOUT_CONFIG,
  PAYOUT_PROVIDER_ENVIRONMENT,
} = require("../../../../constants/payouts");

const API_VERSION =
  process.env.CASHFREE_PAYOUT_API_VERSION ||
  PAYOUT_CONFIG.CASHFREE_DEFAULT_API_VERSION;
const TIMEOUT_MS = Number(
  process.env.CASHFREE_PAYOUT_TIMEOUT_MS ||
    PAYOUT_CONFIG.CASHFREE_DEFAULT_TIMEOUT_MS,
);

function getBaseUrl() {
  return process.env.CASHFREE_PAYOUT_ENV ===
    PAYOUT_PROVIDER_ENVIRONMENT.PRODUCTION
    ? PAYOUT_CONFIG.CASHFREE_PRODUCTION_BASE_URL
    : PAYOUT_CONFIG.CASHFREE_SANDBOX_BASE_URL;
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
  const input = `${clientId}.${Math.floor(
    Date.now() / PAYOUT_CONFIG.MILLISECONDS_PER_SECOND,
  )}`;
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

function safeProviderErrorMessage(message) {
  const sensitiveDigits = new RegExp(
    `\\d{${PAYOUT_CONFIG.REDACT_DIGIT_SEQUENCE_LENGTH},}`,
    "g",
  );
  return String(message)
    .replace(sensitiveDigits, "[redacted]")
    .slice(0, PAYOUT_CONFIG.MAX_ERROR_LENGTH);
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
  const wrapped = new Error(safeProviderErrorMessage(message));
  wrapped.providerStatusCode = statusCode;
  wrapped.providerErrorCode = body.subCode || body.code || null;
  // 5xx, timeouts, and connection failures are ambiguous: the transfer may exist.
  wrapped.definitive =
    typeof error?.definitive === "boolean"
      ? error.definitive
      : Boolean(
          statusCode >= PAYOUT_HTTP_STATUS.CLIENT_ERROR_MIN &&
          statusCode < PAYOUT_HTTP_STATUS.SERVER_ERROR_MIN &&
          statusCode !== PAYOUT_HTTP_STATUS.CONFLICT,
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
    if (error.providerStatusCode === PAYOUT_HTTP_STATUS.NOT_FOUND) return null;
    throw error;
  }
}

async function createBeneficiary(payload, beneficiaryId) {
  const response = await call("POST", "/beneficiary", {
    data: payload,
    requestId: `bene-${beneficiaryId}`.slice(
      0,
      PAYOUT_CONFIG.CASHFREE_REQUEST_ID_MAX_LENGTH,
    ),
  });
  return response.data;
}

async function createTransfer(payload) {
  const response = await call("POST", "/transfers", {
    data: payload,
    requestId: `transfer-${payload.transfer_id}`.slice(
      0,
      PAYOUT_CONFIG.CASHFREE_REQUEST_ID_MAX_LENGTH,
    ),
  });
  return { ...response.data, _httpStatus: response.status };
}

async function fetchTransferByReference(referenceId) {
  try {
    const response = await call("GET", "/transfers", {
      params: { transfer_id: referenceId },
      requestId: `status-${referenceId}`.slice(
        0,
        PAYOUT_CONFIG.CASHFREE_REQUEST_ID_MAX_LENGTH,
      ),
    });
    return { ...response.data, _httpStatus: response.status };
  } catch (error) {
    if (error.providerStatusCode === PAYOUT_HTTP_STATUS.NOT_FOUND) return null;
    throw error;
  }
}

async function createBatchTransfer(payload) {
  const response = await call("POST", "/transfers/batch", {
    data: payload,
    requestId: `batch-${payload.batch_transfer_id}`.slice(
      0,
      PAYOUT_CONFIG.CASHFREE_REQUEST_ID_MAX_LENGTH,
    ),
  });
  return { ...response.data, _httpStatus: response.status };
}

async function fetchBatchTransferByReference(batchReferenceId) {
  try {
    const response = await call("GET", "/transfers/batch", {
      params: { batch_transfer_id: batchReferenceId },
      requestId: `batch-status-${batchReferenceId}`.slice(
        0,
        PAYOUT_CONFIG.CASHFREE_REQUEST_ID_MAX_LENGTH,
      ),
    });
    return { ...response.data, _httpStatus: response.status };
  } catch (error) {
    if (error.providerStatusCode === PAYOUT_HTTP_STATUS.NOT_FOUND) return null;
    throw error;
  }
}

module.exports = {
  validateConfig,
  getBeneficiary,
  createBeneficiary,
  createTransfer,
  fetchTransferByReference,
  createBatchTransfer,
  fetchBatchTransferByReference,
};

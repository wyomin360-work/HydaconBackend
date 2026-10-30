const {
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
  PAYOUT_METHOD_VALUES,
} = require("../constants/payouts");

const createWithdrawalRequestType = {
  type: "object",
  properties: {
    cashAmount: { type: "number", minimum: 1 },
  },
  required: ["cashAmount"],
  additionalProperties: false,
};

const cancelWithdrawalRequestType = {
  type: "object",
  properties: {
    remarks: {
      type: "string",
      minLength: PAYOUT_CONFIG.CANCELLATION_REASON_MIN_LENGTH,
      maxLength: PAYOUT_CONFIG.CANCELLATION_REASON_MAX_LENGTH,
    },
  },
  additionalProperties: false,
};

const listWithdrawalsRequestType = {
  type: "object",
  properties: {
    page: { type: "number", minimum: 1 },
    limit: { type: "number", minimum: 1 },
    status: { type: "string" },
    search: { type: "string" },
  },
  additionalProperties: false,
};

const approveWithdrawalBatchRequestType = {
  type: "object",
  properties: {
    withdrawalIds: {
      type: "array",
      minItems: PAYOUT_CONFIG.CASHFREE_BATCH_MIN_SIZE,
      maxItems: PAYOUT_CONFIG.CASHFREE_BATCH_PRODUCTION_MAX_SIZE,
      uniqueItems: true,
      items: {
        type: "string",
        pattern: `^[a-fA-F0-9]{${PAYOUT_CONFIG.MONGODB_OBJECT_ID_HEX_LENGTH}}$`,
        errorMessage: PAYOUT_MESSAGE.PAYOUT_BATCH_ID_INVALID,
      },
      errorMessage: {
        minItems: PAYOUT_MESSAGE.PAYOUT_BATCH_SIZE_INVALID(
          PAYOUT_CONFIG.CASHFREE_BATCH_MIN_SIZE,
          PAYOUT_CONFIG.CASHFREE_BATCH_PRODUCTION_MAX_SIZE,
        ),
        maxItems: PAYOUT_MESSAGE.PAYOUT_BATCH_SIZE_INVALID(
          PAYOUT_CONFIG.CASHFREE_BATCH_MIN_SIZE,
          PAYOUT_CONFIG.CASHFREE_BATCH_PRODUCTION_MAX_SIZE,
        ),
        uniqueItems: PAYOUT_MESSAGE.PAYOUT_BATCH_DUPLICATE_WITHDRAWALS,
      },
    },
  },
  required: ["withdrawalIds"],
  additionalProperties: false,
  errorMessage: {
    required: {
      withdrawalIds: PAYOUT_MESSAGE.PAYOUT_BATCH_IDS_REQUIRED,
    },
  },
};

const approveWithdrawalRequestType = {
  type: "object",
  properties: {
    payoutMethod: { type: "string", enum: PAYOUT_METHOD_VALUES },
  },
  additionalProperties: false,
};

module.exports = {
  createWithdrawalRequestType,
  cancelWithdrawalRequestType,
  listWithdrawalsRequestType,
  approveWithdrawalBatchRequestType,
  approveWithdrawalRequestType,
};

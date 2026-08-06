const createWithdrawalRequestType = {
  type: "object",
  properties: {
    coinAmount: { type: "number", minimum: 1 },
  },
  required: ["coinAmount"],
  additionalProperties: false,
};

const cancelWithdrawalRequestType = {
  type: "object",
  properties: {
    remarks: { type: "string" },
  },
  additionalProperties: false,
};

const listWithdrawalsRequestType = {
  type: "object",
  properties: {
    page: { type: "number", minimum: 1 },
    limit: { type: "number", minimum: 1 },
    status: { type: "string" },
  },
  additionalProperties: false,
};

module.exports = {
  createWithdrawalRequestType,
  cancelWithdrawalRequestType,
  listWithdrawalsRequestType,
};

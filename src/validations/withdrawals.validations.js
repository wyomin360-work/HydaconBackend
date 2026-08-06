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
    search: { type: "string" },
  },
  additionalProperties: false,
};

module.exports = {
  createWithdrawalRequestType,
  cancelWithdrawalRequestType,
  listWithdrawalsRequestType,
};

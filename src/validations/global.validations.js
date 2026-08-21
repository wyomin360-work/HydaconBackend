const paginationType = {
  type: "object",
  properties: {
    page: { type: "number", minimum: 1 },
    limit: { type: "number", minimum: 1 },
  },
  additionalProperties: true,
};

module.exports = { paginationType };

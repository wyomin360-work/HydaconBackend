const listScratchCardsRequestType = {
  type: "object",
  properties: {
    userId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1 },
  },
  additionalProperties: false,
};

const scratchCardParamsSchema = {
  type: "object",
  properties: {
    id: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
  },
  required: ["id"],
  additionalProperties: false,
};

module.exports = {
  listScratchCardsRequestType,
  scratchCardParamsSchema,
};

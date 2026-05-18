const createRedeemRequestType = {
  type: "object",
  properties: {
    userId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    productId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    rewardId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    rewardUidCode: { type: "string", minLength: 1 },
    location: {
      type: "object",
      properties: {
        city: { type: "string" },
        state: { type: "string" },
        country: { type: "string" },
      },
      required: ["city", "state", "country"],
      additionalProperties: false,
    },
  },
  required: ["userId", "productId", "rewardId", "rewardUidCode"],
  additionalProperties: false,
};

const listRedeemsRequestType = {
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1 },
    search: { type: "string", minLength: 1 },
    userId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
  },
  required: ["page", "limit"],
  additionalProperties: false,
};

const redeemIdRequestType = {
  type: "object",
  properties: {
    redeemId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
  },
  required: ["redeemId"],
  additionalProperties: false,
};

module.exports = {
  createRedeemRequestType,
  listRedeemsRequestType,
  redeemIdRequestType,
};

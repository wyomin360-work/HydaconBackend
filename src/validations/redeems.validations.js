const createRedeemRequestType = {
  type: "object",
  properties: {
    userId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    productId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    rewardId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    rewardUidCode: { type: "string", minLength: 1 },
    testRewardType: { type: "string", enum: ["POINTS", "GIFT"] },
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
  required: ["userId", "rewardUidCode"],
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

const claimGiftRequestType = {
  type: "object",
  properties: {
    shippingAddress: {
      type: "object",
      properties: {
        addressLine1: { type: "string", minLength: 1 },
        addressLine2: { type: "string" },
        city: { type: "string", minLength: 1 },
        state: { type: "string", minLength: 1 },
        pincode: { type: "string", minLength: 1 },
      },
      required: ["addressLine1", "city", "state", "pincode"],
      additionalProperties: false,
    },
  },
  required: ["shippingAddress"],
  additionalProperties: false,
};

module.exports = {
  createRedeemRequestType,
  listRedeemsRequestType,
  redeemIdRequestType,
  claimGiftRequestType,
};

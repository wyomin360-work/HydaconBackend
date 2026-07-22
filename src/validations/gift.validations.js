const { SCRATCH_CARD_REWARD_TYPES } = require("../constants/gift");

const categoryCreateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    active: { type: "boolean" },
  },
  required: ["name"],
  additionalProperties: true,
};

const categoryUpdateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    active: { type: "boolean" },
  },
  additionalProperties: false,
};

const giftCreateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    giftType: { type: "string", enum: ["physical", "voucher"] },
    categoryId: { type: "string", minLength: 24, maxLength: 24 },
    priceInCoins: { type: "number", minimum: 0 },
    stockQuantity: { type: "number", minimum: 0 },
    image: { type: "string" },
    active: { type: "boolean" },
    ruleSetId: { type: "string" },
    voucherRedemptionType: { type: "string", enum: ["code", "file"] },
    voucherCode: { type: "string", minLength: 1 },
    voucherFileUrl: { type: "string", minLength: 1 },
    themeColor: { type: "string" },
  },
  required: [
    "name",
    "description",
    "giftType",
    "priceInCoins",
    "stockQuantity",
  ],
  additionalProperties: true,
};

const giftUpdateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    giftType: { type: "string", enum: ["physical", "voucher"] },
    categoryId: { type: "string", minLength: 24, maxLength: 24 },
    priceInCoins: { type: "number", minimum: 0 },
    stockQuantity: { type: "number", minimum: 0 },
    image: { type: "string" },
    active: { type: "boolean" },
    ruleSetId: { type: "string" },
    voucherRedemptionType: { type: "string", enum: ["code", "file"] },
    voucherCode: { type: "string", minLength: 1 },
    voucherFileUrl: { type: "string", minLength: 1 },
    themeColor: { type: "string" },
  },
  additionalProperties: false,
};

const scratchCardConfigUpdateRequestType = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    probability: { type: "number", minimum: 0, maximum: 100 },
    minBonusPoints: { type: "number", minimum: 0 },
    maxBonusPoints: { type: "number", minimum: 0 },
    giftProbability: { type: "number", minimum: 0, maximum: 100 },
    selectedGiftIds: {
      type: "array",
      items: { type: "string" },
    },
  },
  additionalProperties: false,
  errorMessage: {
    additionalProperties: "Unrecognized request properties sent",
  },
};

const scratchCardRuleCreateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    startDate: { type: ["string", "null"] },
    endDate: { type: ["string", "null"] },
    active: { type: "boolean" },
    ruleSetId: { type: ["string", "null"] },
    tierId: { type: ["string", "null"] },
    giftId: { type: ["string", "null"] },
    rewardType: { type: "string" },
    minCoins: { type: "number", minimum: 0 },
    maxCoins: { type: "number", minimum: 0 },
    totalScratchLimit: { type: "number", minimum: 0 },
    perUserScratchLimit: { type: "number", minimum: 0 },
    rewards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rewardType: {
            type: "string",
            enum: Object.values(SCRATCH_CARD_REWARD_TYPES),
          },
          minCoins: { type: "number", minimum: 0 },
          maxCoins: { type: "number", minimum: 0 },
          minPoints: { type: "number", minimum: 0 },
          maxPoints: { type: "number", minimum: 0 },
          giftId: { type: ["string", "null"] },
          stockLimit: { type: "number", minimum: 0 },
          probability: { type: "number", minimum: 0, maximum: 100 },
        },
        required: ["rewardType", "probability"],
        additionalProperties: false,
      },
    },
    gifts: { type: "array" },
  },
  required: ["name"],
  additionalProperties: false,
  errorMessage: {
    required: {
      name: "Campaign name is required",
    },
    additionalProperties: "Unrecognized request properties sent",
  },
};

const scratchCardRuleUpdateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    startDate: { type: ["string", "null"] },
    endDate: { type: ["string", "null"] },
    active: { type: "boolean" },
    ruleSetId: { type: ["string", "null"] },
    tierId: { type: ["string", "null"] },
    giftId: { type: ["string", "null"] },
    rewardType: { type: "string" },
    minCoins: { type: "number", minimum: 0 },
    maxCoins: { type: "number", minimum: 0 },
    totalScratchLimit: { type: "number", minimum: 0 },
    perUserScratchLimit: { type: "number", minimum: 0 },
    rewards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rewardType: {
            type: "string",
            enum: Object.values(SCRATCH_CARD_REWARD_TYPES),
          },
          minCoins: { type: "number", minimum: 0 },
          maxCoins: { type: "number", minimum: 0 },
          minPoints: { type: "number", minimum: 0 },
          maxPoints: { type: "number", minimum: 0 },
          giftId: { type: ["string", "null"] },
          stockLimit: { type: "number", minimum: 0 },
          probability: { type: "number", minimum: 0, maximum: 100 },
        },
        required: ["rewardType", "probability"],
        additionalProperties: false,
      },
    },
    gifts: { type: "array" },
  },
  additionalProperties: false,
  errorMessage: {
    additionalProperties: "Unrecognized request properties sent",
  },
};

module.exports = {
  categoryCreateRequestType,
  categoryUpdateRequestType,
  giftCreateRequestType,
  giftUpdateRequestType,
  scratchCardConfigUpdateRequestType,
  scratchCardRuleCreateRequestType,
  scratchCardRuleUpdateRequestType,
};

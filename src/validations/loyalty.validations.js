const { CARRY_FORWARD_BEHAVIOR } = require("../constants/loyalty");

const loyaltyClaimRewardRequestType = {
  type: "object",
  properties: {
    seasonId: { type: "string" },
    tierId: { type: "string" },
  },
  additionalProperties: false,
  errorMessage: {
    additionalProperties: "Unrecognized request properties sent",
  },
};

const loyaltyTierCreateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    key: { type: "string", minLength: 1 },
    rank: { type: "integer", minimum: 0 },
    colorIdentity: { type: "string" },
    qualificationPoint: { type: "number", minimum: 0 },
    threshold: { type: "number", minimum: 0 },
    rewardPoints: { type: "number", minimum: 0 },
    rewardCoins: { type: "number", minimum: 0 },
    isArchived: { type: "boolean" },
  },
  required: ["name", "key", "rank"],
  additionalProperties: false,
  errorMessage: {
    required: {
      name: "Tier name is required",
      key: "Tier key is required",
      rank: "Tier rank is required",
    },
    additionalProperties: "Unrecognized request properties sent",
  },
};

const loyaltyTierUpdateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    key: { type: "string", minLength: 1 },
    rank: { type: "integer", minimum: 0 },
    colorIdentity: { type: "string" },
    qualificationPoint: { type: "number", minimum: 0 },
    threshold: { type: "number", minimum: 0 },
    rewardPoints: { type: "number", minimum: 0 },
    rewardCoins: { type: "number", minimum: 0 },
    isArchived: { type: "boolean" },
  },
  additionalProperties: false,
  errorMessage: {
    additionalProperties: "Unrecognized request properties sent",
  },
};

const loyaltySeasonCreateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    code: { type: "string", minLength: 1 },
    startDate: { type: "string" },
    endDate: { type: "string" },
    active: { type: "boolean" },
    carryForwardBehavior: {
      type: "string",
      enum: Object.values(CARRY_FORWARD_BEHAVIOR),
    },
    carryForwardPercentage: { type: "number", minimum: 0, maximum: 100 },
    seasonDetails: { type: "object" },
    seasoDetaisl: { type: "object" },
    tierConfigurations: { type: ["array", "object"] },
    tierconfigurations: { type: ["array", "object"] },
  },
  additionalProperties: false,
  errorMessage: {
    additionalProperties: "Unrecognized request properties sent",
  },
};

const loyaltySeasonUpdateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    code: { type: "string", minLength: 1 },
    startDate: { type: "string" },
    endDate: { type: "string" },
    active: { type: "boolean" },
    carryForwardBehavior: {
      type: "string",
      enum: Object.values(CARRY_FORWARD_BEHAVIOR),
    },
    carryForwardPercentage: { type: "number", minimum: 0, maximum: 100 },
    seasonDetails: { type: "object" },
    seasoDetaisl: { type: "object" },
    tierConfigurations: { type: ["array", "object"] },
    tierconfigurations: { type: ["array", "object"] },
  },
  additionalProperties: false,
  errorMessage: {
    additionalProperties: "Unrecognized request properties sent",
  },
};

const tierRewardItemSchema = {
  type: "object",
  properties: {
    rewardType: {
      type: "string",
      enum: ["POINTS", "COINS", "GIFT", "PHYSICAL_GIFT"],
    },
    points: { type: "number", minimum: 0 },
    coins: { type: "number", minimum: 0 },
    giftId: { type: "string" },
    giftName: { type: "string" },
    title: { type: "string" },
  },
  required: ["rewardType"],
  additionalProperties: false,
};

const loyaltyTierConfigCreateRequestType = {
  type: "object",
  properties: {
    seasonId: { type: "string", minLength: 1 },
    tierId: { type: "string", minLength: 1 },
    qualificationPoint: { type: "number", minimum: 0 },
    threshold: { type: "number", minimum: 0 },
    isFinalTier: { type: "boolean" },
    pointMultiplier: { type: "number", minimum: 0 },
    rewards: {
      type: "array",
      items: tierRewardItemSchema,
    },
    active: { type: "boolean" },
    metadata: { type: "object" },
  },
  required: ["seasonId", "tierId"],
  additionalProperties: false,
  errorMessage: {
    required: {
      seasonId: "seasonId is required",
      tierId: "tierId is required",
    },
    additionalProperties: "Unrecognized request properties sent",
  },
};

const loyaltyTierConfigUpdateRequestType = {
  type: "object",
  properties: {
    seasonId: { type: "string" },
    tierId: { type: "string" },
    qualificationPoint: { type: "number", minimum: 0 },
    threshold: { type: "number", minimum: 0 },
    isFinalTier: { type: "boolean" },
    pointMultiplier: { type: "number", minimum: 0 },
    rewards: {
      type: "array",
      items: tierRewardItemSchema,
    },
    active: { type: "boolean" },
    metadata: { type: "object" },
  },
  additionalProperties: false,
  errorMessage: {
    additionalProperties: "Unrecognized request properties sent",
  },
};

module.exports = {
  loyaltyClaimRewardRequestType,
  loyaltyTierCreateRequestType,
  loyaltyTierUpdateRequestType,
  loyaltySeasonCreateRequestType,
  loyaltySeasonUpdateRequestType,
  loyaltyTierConfigCreateRequestType,
  loyaltyTierConfigUpdateRequestType,
};

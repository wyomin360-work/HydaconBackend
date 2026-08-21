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
    _id: { type: "string" },
    id: { type: "string" },
    name: { type: "string", minLength: 1 },
    key: { type: "string", minLength: 1 },
    rank: { type: "integer", minimum: 0 },
    colorIdentity: { type: "string" },
    badgeUrl: { type: ["string", "null"] },
    qualificationPoint: { type: "number", minimum: 0 },
    threshold: { type: "number", minimum: 0 },
    rewardPoints: { type: "number", minimum: 0 },
    rewardCoins: { type: "number", minimum: 0 },
    isArchived: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    __v: { type: "number" },
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
    bannerImages: { type: "array", items: { type: "string" } },
    carryForwardBehavior: {
      type: "string",
      enum: Object.values(CARRY_FORWARD_BEHAVIOR),
    },
    carryForwardPercentage: {
      type: ["number", "null"],
      minimum: 0,
      maximum: 100,
    },
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
    _id: { type: "string" },
    id: { type: "string" },
    name: { type: "string", minLength: 1 },
    code: { type: "string", minLength: 1 },
    startDate: { type: "string" },
    endDate: { type: "string" },
    active: { type: "boolean" },
    bannerImages: { type: "array", items: { type: "string" } },
    carryForwardBehavior: {
      type: "string",
      enum: Object.values(CARRY_FORWARD_BEHAVIOR),
    },
    carryForwardPercentage: {
      type: ["number", "null"],
      minimum: 0,
      maximum: 100,
    },
    seasonDetails: { type: "object" },
    seasoDetaisl: { type: "object" },
    tierConfigurations: { type: ["array", "object"] },
    tierconfigurations: { type: ["array", "object"] },
    isArchived: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    __v: { type: "number" },
  },
  additionalProperties: false,
  errorMessage: {
    additionalProperties: "Unrecognized request properties sent",
  },
};

const tierRewardItemSchema = {
  type: "object",
  properties: {
    _id: { type: ["string", "null"] },
    id: { type: ["string", "null"] },
    rewardType: {
      type: "string",
      enum: ["POINTS", "COINS", "GIFT", "PHYSICAL_GIFT"],
    },
    points: { type: "number", minimum: 0 },
    coins: { type: "number", minimum: 0 },
    giftId: { type: ["string", "null"] },
    giftName: { type: ["string", "null"] },
    title: { type: ["string", "null"] },
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
    _id: { type: "string" },
    id: { type: "string" },
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
    isArchived: { type: "boolean" },
    metadata: { type: "object" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    __v: { type: "number" },
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

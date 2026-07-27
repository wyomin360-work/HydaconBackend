const {
  REWARD_TYPE,
  PRODUCT_SCOPE,
  TIER_SCOPE,
  CONTEST_METRICS,
} = require("../constants/contests");

const prizeItemSchema = {
  type: "object",
  properties: {
    rank: { type: "integer", minimum: 1 },
    rewardType: { type: "string", enum: Object.values(REWARD_TYPE) },
    points: { type: "integer", minimum: 0 },
    coins: { type: "integer", minimum: 0 },
    giftId: { type: "string" },
    giftName: { type: "string" },
  },
  required: ["rank", "rewardType"],
  additionalProperties: false,
};

const adminCreateContestRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    bannerImage: { type: "string" },
    rewardSummary: { type: "string" },
    startDate: { type: "string" },
    endDate: { type: "string" },
    region: { type: ["string", "null"] },
    ruleSetId: { type: ["string", "null"] },
    productScope: { type: "string" },
    products: {
      type: "array",
      items: { type: "string" },
    },
    tierScope: { type: "string" },
    tiers: {
      type: "array",
      items: { type: "string" },
    },
    prizes: {
      type: "array",
      items: prizeItemSchema,
    },
    metric: { type: "string", enum: Object.values(CONTEST_METRICS) },
    active: { type: "boolean" },
  },
  required: ["name", "startDate", "endDate"],
  additionalProperties: false,
  errorMessage: {
    required: {
      name: "Name is required",
      startDate: "Start date is required",
      endDate: "End date is required",
    },
    additionalProperties: "Unrecognized request properties sent",
  },
};

const adminUpdateContestRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    bannerImage: { type: "string" },
    rewardSummary: { type: "string" },
    startDate: { type: "string" },
    endDate: { type: "string" },
    region: { type: ["string", "null"] },
    ruleSetId: { type: ["string", "null"] },
    productScope: { type: "string" },
    products: {
      type: "array",
      items: { type: "string" },
    },
    tierScope: { type: "string" },
    tiers: {
      type: "array",
      items: { type: "string" },
    },
    prizes: {
      type: "array",
      items: prizeItemSchema,
    },
    metric: { type: "string", enum: Object.values(CONTEST_METRICS) },
    active: { type: "boolean" },
  },
  additionalProperties: false,
  errorMessage: {
    additionalProperties: "Unrecognized request properties sent",
  },
};

module.exports = {
  adminCreateContestRequestType,
  adminUpdateContestRequestType,
};

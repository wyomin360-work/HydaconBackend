const { MAX_REWARD_BATCH_SIZE } = require("../constants/rewards");

const createRewardRequestType = {
  type: "object",
  properties: {
    expiresAt: { type: "string", format: "date-time" },
    productId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    count: { type: "integer", minimum: 1, maximum: MAX_REWARD_BATCH_SIZE },
  },
  required: ["expiresAt", "productId", "count"],
  additionalProperties: false,
};

const updateRewardRequestType = {
  type: "object",
  properties: {
    expiresAt: { type: "string", format: "date-time" },
    rewardPoints: { type: "integer", minimum: 0 },
    active: { type: "boolean" },
  },
  required: ["rewardPoints", "active"],
  additionalProperties: false,
};

// const listRewardRequestType = {
//     type: 'object',
//     properties: {
//         page: { type: 'integer', minimum: 1 },
//         limit: { type: 'integer', minimum: 1 },
//         productId: { type: 'string', pattern: "^[0-9a-fA-F]{24}$" }
//     },
//     required: ['page', 'limit'],
//     additionalProperties: false
// }

// add search feature
const listRewardRequestType = {
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1 },
    productId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    batchId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    search: { type: "string" },
    sortBy: {
      type: "string",
      enum: ["createdAt", "expiresAt", "point", "uidCode"],
    },
    sortOrder: { type: "string", enum: ["asc", "desc"] },
    filters: {
      type: "object",
      properties: {
        active: { type: "boolean" },
        isRedeemed: { type: "boolean" },
        minPoints: { type: "number", minimum: 0 },
        maxPoints: { type: "number", minimum: 0 },
        expiresAfter: { type: "string", format: "date-time" },
        expiresBefore: { type: "string", format: "date-time" },
        createdDate: { type: "string" },
        createdAtAfter: { type: "string", format: "date-time" },
        createdAtBefore: { type: "string", format: "date-time" },
      },
      additionalProperties: false,
    },
  },
  required: ["page", "limit"],
  additionalProperties: false,
};

const listGroupedRewardsRequestType = {
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1 },
    productId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    startDate: { type: "string" },
    endDate: { type: "string" },
    filters: {
      type: "object",
      properties: {
        active: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  required: ["page", "limit"],
  additionalProperties: false,
};

const listRewardBatchesRequestType = {
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1, maximum: 200 },
    productId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    search: { type: "string", maxLength: 64 },
    startDate: { type: "string" },
    endDate: { type: "string" },
    activityStatus: { type: "string", enum: ["active", "inactive"] },
    status: { type: "string", enum: ["creating", "complete", "failed"] },
  },
  required: ["page", "limit"],
  additionalProperties: false,
};

const updateRewardBatchRequestType = {
  type: "object",
  properties: {
    expiresAt: { type: "string", format: "date-time" },
    endDate: { type: "string", format: "date-time" },
    rewardPoints: { type: "integer", minimum: 0 },
  },
  anyOf: [
    { required: ["expiresAt"] },
    { required: ["endDate"] },
    { required: ["rewardPoints"] },
  ],
  additionalProperties: false,
};

const bulkUpdateRewardRequestType = {
  type: "object",
  properties: {
    rewardIds: {
      type: "array",
      items: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
      minItems: 1,
    },
    rewardPoints: { type: "integer", minimum: 0 },
    expiresAt: { type: "string", format: "date-time" },
  },
  required: ["rewardIds"],
  anyOf: [{ required: ["rewardPoints"] }, { required: ["expiresAt"] }],
  additionalProperties: false,
};

const batchUpdateRewardRequestType = {
  type: "object",
  properties: {
    productId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    createdDate: { type: "string" },
    batchId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    rewardPoints: { type: "integer", minimum: 0 },
    expiresAt: { type: "string", format: "date-time" },
  },
  allOf: [
    {
      anyOf: [
        { required: ["productId", "createdDate"] },
        { required: ["batchId"] },
      ],
    },
    { anyOf: [{ required: ["rewardPoints"] }, { required: ["expiresAt"] }] },
  ],
  additionalProperties: false,
};

module.exports = {
  createRewardRequestType,
  updateRewardRequestType,
  bulkUpdateRewardRequestType,
  batchUpdateRewardRequestType,
  listRewardRequestType,
  listGroupedRewardsRequestType,
  listRewardBatchesRequestType,
  updateRewardBatchRequestType,
};

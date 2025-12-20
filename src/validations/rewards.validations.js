const { search } = require("../modules/rewards/rewards.routes")

const createRewardRequestType = {
    type: 'object',
    properties: {
        expiresAt: { type: 'string', format: 'date-time' },
        productId: { type: 'string', pattern: "^[0-9a-fA-F]{24}$" },
        count: { type: 'integer', minimum: 1 }
    },
    required: ['expiresAt', 'productId', 'count'],
    additionalProperties: false
}

const updateRewardRequestType = {
    type: 'object',
    properties: {
        expiresAt: { type: 'string', format: 'date-time' },
        rewardPoints: { type: 'integer', minimum: 0 },
        active: { type: 'boolean' }
    },
    required: ['rewardPoints', 'active'],
    additionalProperties: false
}

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
    type: 'object',
    properties: {
        page: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1 },
        productId: { type: 'string', pattern: "^[0-9a-fA-F]{24}$" },
        search: { type: 'string' },
        sortBy: { type: 'string', enum: ['createdAt', 'expiresAt', 'point', 'uidCode'] },
        sortOrder: { type: 'string', enum: ['asc', 'desc'] },
        filters: {
            type: 'object',
            properties: {
                active: { type: 'boolean' },
                isRedeemed: { type: 'boolean' },
                minPoints: { type: 'number', minimum: 0 },
                maxPoints: { type: 'number', minimum: 0 },
                expiresAfter: { type: 'string', format: 'date-time' },
                expiresBefore: { type: 'string', format: 'date-time' }
            },
            additionalProperties: false
        }
    },
    required: ['page', 'limit'],
    additionalProperties: false
}

module.exports = {
    createRewardRequestType,
    updateRewardRequestType,
    listRewardRequestType
}

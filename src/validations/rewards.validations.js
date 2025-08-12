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

const listRewardRequestType = {
    type: 'object',
    properties: {
        page: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1 },
        productId: { type: 'string', pattern: "^[0-9a-fA-F]{24}$" }
    },
    required: ['page', 'limit'],
    additionalProperties: false
}

module.exports = {
    createRewardRequestType,
    updateRewardRequestType,
    listRewardRequestType
}

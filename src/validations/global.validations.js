const paginationType = {
    type: 'object',
    properties: {
        page: { type: 'number', minimum: 1 },
        limit: { type: 'number', minimum: 1 }
    },
    required: ['page', 'limit']
}

module.exports = { paginationType }
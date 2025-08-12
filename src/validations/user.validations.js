
const userRegisterRequestType = {
    type: 'object',
    properties: {
        email: { type: 'string', format: 'email' },
        name: { type: 'string'},
        password: { type: 'string', format: 'password' },
    },
    required: ['email', 'password','name'],
    additionalProperties: false
}

const userLoginRequestType = {
    type: 'object',
    properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', format: 'password' },
    },
    required: ['email', 'password'],
    additionalProperties: false
}

module.exports = {
    userLoginRequestType,
    userRegisterRequestType
}
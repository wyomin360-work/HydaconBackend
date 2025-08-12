const Ajv = require('ajv')
const addFormats = require('ajv-formats')
const AppError = require('../utils/appError')

const ajv = new Ajv({ allErrors: true })

addFormats(ajv)

const validateRequest = (schema, property='body') => {
    const validate = ajv.compile(schema)
    return (req, res, next) => {
        const valid = validate(req[property])
        if (!valid) {
            const errors = validate.errors.map((err) => `${err.instancePath || err.instancePath || err.params.missingProperty} ${err.message}`).join(", ");
            return next(new AppError(errors, 400))
        }
        next()
    }
}
module.exports = validateRequest
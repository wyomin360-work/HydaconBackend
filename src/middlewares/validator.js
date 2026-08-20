const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const ajvErrors = require("ajv-errors");
const AppError = require("../utils/appError");

const ajv = new Ajv({ allErrors: true, strict: false });

addFormats(ajv);
ajvErrors(ajv);

const validateRequest = (schema, property = "body") => {
  const validate = ajv.compile(schema);
  return (req, res, next) => {
    const valid = validate(req[property]);
    if (!valid) {
      const errors = validate.errors
        .map((err) => {
          const prop =
            err.params?.additionalProperty ||
            err.params?.missingProperty ||
            (err.instancePath ? err.instancePath.replace(/^\//, "") : "");
          return prop ? `'${prop}': ${err.message}` : err.message;
        })
        .join(", ");
      return next(new AppError(errors, 400));
    }
    next();
  };
};
module.exports = validateRequest;

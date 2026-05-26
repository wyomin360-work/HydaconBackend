const AppError = require("../utils/appError");

/** Blocks the route when NODE_ENV is production. */
function devOnly(req, res, next) {
  if (process.env.NODE_ENV === "production") {
    return next(
      new AppError("This endpoint is not available in production.", 403),
    );
  }
  next();
}

module.exports = devOnly;

const { logger } = require("../config/pino.config")


const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';
        
    logger.error(err.message,
        {
            stack: err.stack,
            statusCode: err.statusCode,
            url: req.originalUrl,
            method: req.method
        }
    )

    if (err.isOperational) {
        return res.status(err.statusCode).json({
            status: err.status,
            message: err.message
        });
    }

    // For programming/unknown errors: generic message in prod
    res.status(500).json({
        status: 'error',
        message: process.env.NODE_ENV === 'production'
            ? 'Something went wrong!'
            : err.message
    });
}

module.exports = errorHandler
const pino = require('pino')

class Logger {
    constructor() {
        this.logger = pino({
            level: process.env.NODE_ENV === 'prod' ? "info" : "debug",
            transport: process.env.NODE_ENV === 'prod' ? {
                target: "pino-pretty",
                options: { colorize: true }
            } : {
                target: "pino-pretty",
                options: { colorize: true }
            }
        })
    }

    info(message, meta = {}) {
        this.logger.info(meta, message);
    }

    warn(message, meta = {}) {
        this.logger.warn(meta, message);
    }

    error(message, meta = {}) {
        this.logger.error(meta, message);
    }

    debug(message, meta = {}) {
        this.logger.debug(meta, message);
    }
}

module.exports = new Logger()
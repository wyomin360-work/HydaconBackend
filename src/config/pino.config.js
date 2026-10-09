const pino = require("pino");

class Logger {
  constructor() {
    const isProduction = ["prod", "production"].includes(
      process.env.NODE_ENV?.toLowerCase(),
    );
    this.logger = pino({
      level: isProduction ? "info" : "debug",
      ...(isProduction
        ? {}
        : {
            transport: {
              target: "pino-pretty",
              options: { colorize: true },
            },
          }),
    });
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

module.exports = new Logger();

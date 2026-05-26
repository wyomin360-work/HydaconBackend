const RateLimit = require("../schemas/rate-limit.schema");
const { sendFailResponse } = require("../utils/responseHandlers");

function normalizeIdentifier(val) {
  if (!val) return "";
  const str = String(val).trim().toLowerCase();
  if (str.includes("@")) {
    return str; // email
  }
  // It's a phone number, strip all non-digits
  const digits = str.replace(/\D/g, "");
  if (digits.length >= 10) {
    // Return last 10 digits for normalization (especially for Indian numbers)
    return digits.slice(-10);
  }
  return digits;
}

const rateLimiter = ({ windowMs, max, message }) => {
  return async (req, res, next) => {
    const ip =
      req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const bodyId = req.body?.identity || req.body?.phone || req.body?.email;

    const keys = [`ip:${ip}`];
    if (bodyId) {
      const norm = normalizeIdentifier(bodyId);
      if (norm) {
        keys.push(`id:${norm}`);
      }
    }

    try {
      const now = new Date();
      for (const key of keys) {
        const fullKey = `otp:${key}`;

        let record = await RateLimit.findOne({ key: fullKey });

        if (!record) {
          try {
            record = await RateLimit.create({
              key: fullKey,
              hits: 1,
              resetTime: new Date(Date.now() + windowMs),
            });
          } catch (createErr) {
            if (createErr.code === 11000) {
              record = await RateLimit.findOne({ key: fullKey });
            } else {
              throw createErr;
            }
          }
        } else {
          if (record.resetTime < now) {
            record.hits = 1;
            record.resetTime = new Date(Date.now() + windowMs);
            await record.save();
          } else {
            if (record.hits >= max) {
              const remainingSec = Math.ceil(
                (record.resetTime.getTime() - now.getTime()) / 1000,
              );
              res.setHeader("Retry-After", remainingSec);
              return sendFailResponse(
                message ||
                  `Too many requests. Please try again after ${remainingSec} seconds.`,
                429,
              );
            }
            record.hits += 1;
            await record.save();
          }
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = rateLimiter;

const Redis = require("ioredis");

let redis = null;

if (process.env.REDIS_URL || process.env.NODE_ENV === "production") {
  redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
    maxRetriesPerRequest: 1, // Fail fast locally if redis is not running
    enableReadyCheck: false,
    connectTimeout: 2000,
  });

  redis.on("error", (err) => {
    // Only log the full error once to avoid spamming local console
    if (redis && !redis.hasLoggedError) {
      console.warn(
        "⚠️ Redis client connection failed. Falling back to local in-memory execution.",
      );
      redis.hasLoggedError = true;
    }
  });

  redis.on("connect", () => {
    console.log("🔌 Connected to Redis successfully.");
    if (redis) redis.hasLoggedError = false;
  });
}

module.exports = redis;

require("dotenv").config();

const { isSmsConfigured } = require("./src/functions/sms");
const { initCronJobs } = require("./src/cron");

const app = require("./src/app");
const Database = require("./src/config/mongodb.config");
const { logger } = require("./src/config/pino.config");
const {
  ensurePayoutAuditIndexes,
} = require("./src/config/payout-audit-indexes");
const {
  initializeRewardBatchDownloadQueue,
  ensureInlineRewardBatchDownloadIndexes,
} = require("./src/modules/rewards/reward-batch-download.queue");

const PORT = process.env.PORT || 5000;
const db = new Database();
let server;
let shutdownPromise;
const {
  closeRewardBatchDownloadQueue,
} = require("./src/modules/rewards/reward-batch-download.queue");

async function shutdown(signal, exitCode = 0) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    console.log(
      `Received ${signal}; shutting down reward ZIP worker and HTTP server.`,
    );
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await closeRewardBatchDownloadQueue();
    process.exit(exitCode);
  })();
  return shutdownPromise;
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught Errors
process.on("uncaughtException", (err) => {
  logger.fatal(
    { message: err.message, stack: err.stack },
    "Uncaught Exception",
  );
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  logger.fatal(
    { message: err.message, stack: err.stack },
    "Unhandled Rejection",
  );
  shutdown("unhandledRejection", 1);
});

// Add this in src/app.js, right after your 'app' constant is defined
app.use((req, res, next) => {
  // This will print to your terminal every time ANY request hits the server
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next(); // This is required, otherwise the app will hang
});
const startServer = async () => {
  try {
    await db.connectDb();
    await ensurePayoutAuditIndexes();
    await ensureInlineRewardBatchDownloadIndexes();
    if (process.env.NODE_ENV === "production" && !process.env.REDIS_URL) {
      console.warn(
        "Reward ZIP downloads are using Mongo-backed inline generation; configure REDIS_URL to enable BullMQ workers.",
      );
    }
    try {
      initializeRewardBatchDownloadQueue();
    } catch (error) {
      // Queue outages should not prevent the API from starting. When Redis is
      // configured, download requests return a retryable 503 until it recovers.
      console.error(
        "Unable to initialize reward batch download worker:",
        error,
      );
    }
    // await seedDefaultLoyaltyData();
    initCronJobs();
    server = app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      if (!isSmsConfigured()) {
        console.warn(
          "⚠️  SMS not configured — mobile OTP will fail until you set SMS_PROVIDER and API keys in .env (see Fast2SMS / MSG91 / Twilio)",
        );
      }
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

const { Queue, Worker } = require("bullmq");
const redis = require("../config/redis");
const { processScanSideEffects } = require("../workers/scanEffectsProcessor");

let bullQueue = null;
let bullWorker = null;

// Initialize BullMQ Queue & Worker only if Redis is connected
if (redis) {
  redis.on("connect", () => {
    if (!bullQueue) {
      console.log("🔌 Initializing BullMQ Queue...");
      bullQueue = new Queue("scan-effects", { connection: redis });
    }
    if (!bullWorker) {
      console.log("🔌 Initializing BullMQ Worker...");
      bullWorker = new Worker("scan-effects", async (job) => {
        await processScanSideEffects(job.data);
      }, { connection: redis });

      bullWorker.on("completed", (job) => {
        console.log(`✅ Background Job ${job.id} completed successfully.`);
      });

      bullWorker.on("failed", (job, err) => {
        console.error(`❌ Background Job ${job ? job.id : "unknown"} failed:`, err);
      });
    }
  });

  redis.on("close", () => {
    // If connection closes, tear down locally to force fallback path
    bullQueue = null;
    bullWorker = null;
  });
}

/**
 * Adds a scan effect job to the queue.
 * Falls back to in-memory async setImmediate or synchronous test execution if Redis is offline.
 * 
 * @param {string} jobName
 * @param {object} data
 * @returns {Promise<void>}
 */
async function addJob(jobName, data) {
  // Path A: Unit Testing override
  if (process.env.NODE_ENV === "test") {
    // Run synchronously to ensure test assertions pass immediately
    await processScanSideEffects(data);
    return;
  }

  // Path B: Production/Staging with Active Redis
  if (redis && redis.status === "ready" && bullQueue) {
    try {
      await bullQueue.add(jobName, data, {
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
      });
      return;
    } catch (err) {
      console.warn("⚠️ Failed to enqueue job to BullMQ. Falling back to local in-memory execution.", err);
    }
  }

  // Path C: Local Fallback (Async background execution)
  console.log(`ℹ️ Executing job [${jobName}] asynchronously in-memory...`);
  setImmediate(async () => {
    try {
      await processScanSideEffects(data);
    } catch (err) {
      console.error(`❌ In-Memory background job [${jobName}] failed:`, err);
    }
  });
}

module.exports = {
  addJob,
};

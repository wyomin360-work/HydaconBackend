const { createRewardBatchArchive } = require("./reward-batch-download.service");

let redis = null;
try {
  redis = require("../../config/redis");
} catch (error) {
  console.warn("Redis client is unavailable; reward batch archives will be generated inline.");
}

let Queue;
let Worker;
try {
  ({ Queue, Worker } = require("bullmq"));
} catch (error) {
  console.warn("BullMQ is unavailable; reward batch archives will be generated inline.");
}

const QUEUE_NAME = "reward-batch-downloads";
let queue;
let worker;

function getRewardBatchDownloadQueue() {
  if (!Queue || !Worker || !redis || redis.status !== "ready") return null;
  if (!queue) {
    try {
      queue = new Queue(QUEUE_NAME, { connection: redis });
      worker = new Worker(
        QUEUE_NAME,
        async (job) =>
          createRewardBatchArchive(
            job.data.batchId,
            (progress) => job.updateProgress(progress),
            job.data.rewardIds || null,
          ),
        { connection: redis, concurrency: 1 },
      );
      worker.on("failed", (job, error) => {
        console.error(`Reward batch download ${job?.id || "unknown"} failed:`, error);
      });
      worker.on("error", (error) => {
        console.error("Reward batch download worker error:", error);
      });
      queue.on("error", (error) => {
        console.error("Reward batch download queue error:", error);
      });
    } catch (error) {
      queue = null;
      worker = null;
      console.warn("Unable to initialize reward batch queue; using inline generation:", error);
      return null;
    }
  }
  return queue;
}

async function getRewardBatchDownloadJob(jobId) {
  const activeQueue = getRewardBatchDownloadQueue();
  if (!activeQueue) return null;
  const job = await activeQueue.getJob(jobId);
  if (!job) return null;
  const state = await job.getState();
  return {
    state,
    progress: job.progress,
    result: state === "completed" ? job.returnvalue : undefined,
    error: state === "failed" ? job.failedReason : undefined,
  };
}

module.exports = { getRewardBatchDownloadQueue, getRewardBatchDownloadJob };

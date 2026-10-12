const {
  createRewardBatchArchive,
  isRewardBatchArchiveAvailable,
} = require("./reward-batch-download.service");
const { createHash, randomUUID } = require("crypto");
const mongoose = require("mongoose");
const RewardBatchDownloadJob = require("../../schemas/reward-batch-download-job.schema");

let redis = null;
try {
  redis = require("../../config/redis");
} catch (error) {
  console.warn(
    "Redis client is unavailable; reward batch archives will be generated inline.",
  );
}

let Queue;
let Worker;
let UnrecoverableError;
try {
  ({ Queue, Worker, UnrecoverableError } = require("bullmq"));
} catch (error) {
  console.warn(
    "BullMQ is unavailable; reward batch archives will be generated inline.",
  );
}

const QUEUE_NAME = "reward-batch-downloads";
const INLINE_JOB_TTL_MS = 24 * 60 * 60 * 1000;
const INLINE_JOB_DEDUPE_MS = 50 * 60 * 1000;
const INLINE_JOB_LEASE_MS = 5 * 60 * 1000;
const QUEUE_CANCEL_KEY_PREFIX = `${QUEUE_NAME}:cancel:`;
const QUEUE_CANCEL_TTL_SECONDS = 60 * 60;
let queue;
let worker;
let redisReadyListenerRegistered = false;
const queueJobSnapshots = new Map();

function hasConfiguredSharedQueue() {
  // Production Redis is explicitly configured with REDIS_URL. If it is
  // configured but currently disconnected, callers must not create a
  // process-local job that another instance cannot see.
  return Boolean(Queue && Worker && redis && process.env.REDIS_URL);
}

function retainFinishedJobSnapshot(jobId, snapshot) {
  const previousSnapshot = queueJobSnapshots.get(jobId);
  if (previousSnapshot?.cleanupTimeout)
    clearTimeout(previousSnapshot.cleanupTimeout);
  const timeout = setTimeout(
    () => {
      if (queueJobSnapshots.get(jobId) === snapshot)
        queueJobSnapshots.delete(jobId);
    },
    50 * 60 * 1000,
  );
  timeout.unref?.();
  snapshot.cleanupTimeout = timeout;
}

function getInlineJobRequestKey(batchId, rewardIds) {
  const normalizedRewardIds = Array.isArray(rewardIds)
    ? [...rewardIds].sort()
    : null;
  return createHash("sha256")
    .update(JSON.stringify([String(batchId), normalizedRewardIds]))
    .digest("hex");
}

async function executeInlineRewardBatchDownload(job) {
  const jobId = job._id;
  const leaseOwner = job.leaseOwner;
  const abortController = new AbortController();
  const cancellationPoll = setInterval(async () => {
    const activeJob = await RewardBatchDownloadJob.exists({
      _id: jobId,
      leaseOwner,
      state: "active",
    }).catch(() => true);
    if (!activeJob) abortController.abort();
  }, 1000);
  cancellationPoll.unref?.();
  let lastProgressWriteAt = 0;
  const updateProgress = async (progress) => {
    const now = Date.now();
    if (now - lastProgressWriteAt < 2000 && progress.phase !== "ready") return;
    lastProgressWriteAt = now;
    const update = await RewardBatchDownloadJob.updateOne(
      { _id: jobId, leaseOwner, state: "active" },
      {
        $set: {
          progress,
          leaseUntil: new Date(now + INLINE_JOB_LEASE_MS),
          expiresAt: new Date(now + INLINE_JOB_TTL_MS),
        },
      },
    );
    if (update.matchedCount === 0) {
      const error = new Error("Reward batch download cancelled");
      error.name = "RewardBatchDownloadCancelled";
      throw error;
    }
  };

  try {
    const result = await createRewardBatchArchive(
      job.batchId,
      updateProgress,
      job.rewardIds?.length ? job.rewardIds.map(String) : null,
      { signal: abortController.signal },
    );
    await RewardBatchDownloadJob.updateOne(
      { _id: jobId, leaseOwner, state: "active" },
      {
        $set: {
          state: "completed",
          result,
          finishedAt: new Date(),
          leaseUntil: null,
          expiresAt: new Date(Date.now() + INLINE_JOB_TTL_MS),
        },
      },
    );
  } catch (error) {
    if (error?.name === "RewardBatchDownloadCancelled") return;
    await RewardBatchDownloadJob.updateOne(
      { _id: jobId, leaseOwner, state: "active" },
      {
        $set: {
          state: "failed",
          error: error?.message || "reward batch download failed",
          finishedAt: new Date(),
          leaseUntil: null,
          expiresAt: new Date(Date.now() + INLINE_JOB_TTL_MS),
        },
      },
    ).catch((updateError) =>
      console.error("Unable to persist reward ZIP failure:", updateError),
    );
  } finally {
    clearInterval(cancellationPoll);
  }
}

async function startInlineRewardBatchDownload(batchId, rewardIds = null) {
  const requestKey = getInlineJobRequestKey(batchId, rewardIds);
  const now = new Date();
  const leaseOwner = randomUUID();
  let existing = await RewardBatchDownloadJob.findOne({ requestKey });
  if (existing) {
    const active = existing.state === "active" && existing.leaseUntil > now;
    let reusable =
      existing.state === "completed" &&
      existing.finishedAt &&
      now - existing.finishedAt < INLINE_JOB_DEDUPE_MS;
    if (reusable) {
      reusable = Boolean(
        existing.result &&
          (await isRewardBatchArchiveAvailable(existing.result)),
      );
      if (!reusable) {
        console.warn("Cached inline reward ZIP is missing from S3; regenerating it", {
          jobId: String(existing._id),
          s3Key: existing.result?.s3Key,
        });
      }
    }
    if (active || reusable) return String(existing._id);

    const claimed = await RewardBatchDownloadJob.findOneAndUpdate(
      { _id: existing._id, updatedAt: existing.updatedAt },
      {
        $set: {
          state: "active",
          progress: {
            phase: "generating",
            percent: 0,
            completed: 0,
            total: null,
          },
          leaseOwner,
          leaseUntil: new Date(Date.now() + INLINE_JOB_LEASE_MS),
          expiresAt: new Date(Date.now() + INLINE_JOB_TTL_MS),
        },
        $unset: { result: 1, error: 1, finishedAt: 1 },
      },
      { new: true },
    );
    if (!claimed) {
      existing = await RewardBatchDownloadJob.findOne({ requestKey });
      return existing
        ? String(existing._id)
        : startInlineRewardBatchDownload(batchId, rewardIds);
    }
    void executeInlineRewardBatchDownload(claimed.toObject());
    return String(claimed._id);
  }

  try {
    const created = await RewardBatchDownloadJob.create({
      requestKey,
      batchId,
      rewardIds: rewardIds || [],
      state: "active",
      progress: { phase: "generating", percent: 0, completed: 0, total: null },
      leaseOwner,
      leaseUntil: new Date(Date.now() + INLINE_JOB_LEASE_MS),
      expiresAt: new Date(Date.now() + INLINE_JOB_TTL_MS),
    });
    void executeInlineRewardBatchDownload(created.toObject());
    return String(created._id);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    existing = await RewardBatchDownloadJob.findOne({ requestKey });
    if (!existing) throw error;
    return String(existing._id);
  }
}

async function ensureInlineRewardBatchDownloadIndexes() {
  await RewardBatchDownloadJob.createIndexes();
}

function getRewardBatchDownloadQueue() {
  if (!Queue || !Worker || !redis) return null;
  if (process.env.NODE_ENV === "production" && !process.env.REDIS_URL)
    return null;
  if (queue) return queue;
  if (redis.status !== "ready") return null;
  if (!queue) {
    let workerConnection;
    try {
      queue = new Queue(QUEUE_NAME, { connection: redis });
      workerConnection = redis.duplicate({ maxRetriesPerRequest: null });
      worker = new Worker(
        QUEUE_NAME,
        async (job) => {
          const snapshot = { state: "active", progress: job.progress ?? null };
          queueJobSnapshots.set(String(job.id), snapshot);
          const abortController = new AbortController();
          const cancellationPoll = setInterval(async () => {
            try {
              const redisClient = await redis;
              if (await redisClient.get(`${QUEUE_CANCEL_KEY_PREFIX}${job.id}`)) {
                abortController.abort();
              }
            } catch (error) {
              console.warn("Unable to check reward ZIP cancellation:", error);
            }
          }, 500);
          cancellationPoll.unref?.();
          try {
            const result = await createRewardBatchArchive(
              job.data.batchId,
              async (progress) => {
                const redisClient = await redis;
                if (await redisClient.get(`${QUEUE_CANCEL_KEY_PREFIX}${job.id}`)) {
                  const error = new Error("Reward batch download cancelled");
                  error.name = "RewardBatchDownloadCancelled";
                  throw error;
                }
                snapshot.progress = progress;
                return job.updateProgress(progress).catch((error) => {
                  console.warn("Unable to persist reward ZIP progress:", error);
                });
              },
              job.data.rewardIds || null,
              { signal: abortController.signal },
            );
            snapshot.state = "completed";
            snapshot.result = result;
            retainFinishedJobSnapshot(String(job.id), snapshot);
            return result;
          } catch (error) {
            if (error?.name === "RewardBatchDownloadCancelled") {
              snapshot.state = "cancelled";
              snapshot.error = error.message;
              retainFinishedJobSnapshot(String(job.id), snapshot);
              return { cancelled: true };
            }
            snapshot.state = "failed";
            snapshot.error = error?.message || "reward batch download failed";
            retainFinishedJobSnapshot(String(job.id), snapshot);
            const nonRetryableAwsErrors = new Set([
              "AccessDenied",
              "InvalidAccessKeyId",
              "SignatureDoesNotMatch",
              "NoSuchBucket",
              "PermanentRedirect",
            ]);
            if (
              UnrecoverableError &&
              nonRetryableAwsErrors.has(error?.name || error?.Code)
            ) {
              throw new UnrecoverableError(error.message);
            }
            throw error;
          } finally {
            clearInterval(cancellationPoll);
          }
        },
        {
          // The shared app client uses maxRetriesPerRequest=1 for fast HTTP
          // failures. BullMQ workers require an indefinitely retrying client.
          connection: workerConnection,
          concurrency: 1,
          lockDuration: 5 * 60 * 1000,
          maxStalledCount: 2,
          stalledInterval: 60 * 1000,
        },
      );
      worker.on("failed", (job, error) => {
        console.error(
          `Reward batch download ${job?.id || "unknown"} failed:`,
          error,
        );
      });
      worker.on("error", (error) => {
        console.error("Reward batch download worker error:", error);
      });
      queue.on("error", (error) => {
        console.error("Reward batch download queue error:", error);
      });
    } catch (error) {
      worker?.close().catch(() => {});
      workerConnection?.quit().catch(() => {});
      queue?.close().catch(() => {});
      queue = null;
      worker = null;
      console.warn("Unable to initialize reward batch queue:", error);
      return null;
    }
  }
  return queue;
}

function initializeRewardBatchDownloadQueue() {
  const activeQueue = getRewardBatchDownloadQueue();
  if (activeQueue || !hasConfiguredSharedQueue()) return activeQueue;
  // Redis may still be connecting during app startup. Initialize once it is
  // ready, so queued work is resumed after a deploy/restart without waiting
  // for the next administrator request.
  if (!redisReadyListenerRegistered) {
    redisReadyListenerRegistered = true;
    redis.on("ready", () => {
      try {
        getRewardBatchDownloadQueue();
      } catch (error) {
        console.error(
          "Unable to initialize reward batch worker after Redis reconnect:",
          error,
        );
      }
    });
  }
  return null;
}

async function closeRewardBatchDownloadQueue() {
  const activeWorker = worker;
  const activeQueue = queue;
  worker = null;
  queue = null;
  await activeWorker?.close().catch((error) => {
    console.warn("Unable to close reward batch worker cleanly:", error);
  });
  await activeQueue?.close().catch((error) => {
    console.warn("Unable to close reward batch queue cleanly:", error);
  });
}

async function getRewardBatchDownloadJob(jobId) {
  // Use an already initialized queue even if the Redis client's ready check is
  // momentarily false; BullMQ can reconnect while this status lookup waits.
  const activeQueue = queue || getRewardBatchDownloadQueue();
  if (activeQueue) {
    try {
      const job = await activeQueue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        const cancelled = state === "completed" && job.returnvalue?.cancelled;
        return {
          state: cancelled ? "cancelled" : state,
          progress: job.progress,
          result: state === "completed" ? job.returnvalue : undefined,
          error: state === "failed" ? job.failedReason : undefined,
        };
      }
    } catch (error) {
      console.warn(
        "Unable to read reward ZIP job from Redis; checking local worker state:",
        error,
      );
    }
  }
  const queueJobSnapshot = queueJobSnapshots.get(String(jobId));
  if (queueJobSnapshot) return queueJobSnapshot;
  if (!mongoose.isValidObjectId(jobId)) return null;
  const inlineJob = await RewardBatchDownloadJob.findById(jobId).lean();
  if (!inlineJob) return null;
  if (
    inlineJob.state === "active" &&
    (!inlineJob.leaseUntil || inlineJob.leaseUntil <= new Date())
  ) {
    void startInlineRewardBatchDownload(
      inlineJob.batchId,
      inlineJob.rewardIds?.length ? inlineJob.rewardIds.map(String) : null,
    ).catch((error) =>
      console.error("Unable to resume abandoned reward ZIP job:", error),
    );
  }
  return {
    state: inlineJob.state,
    progress: inlineJob.progress,
    result: inlineJob.result,
    error: inlineJob.error,
  };
}

async function cancelRewardBatchDownload(jobId) {
  const activeQueue = queue || getRewardBatchDownloadQueue();
  if (activeQueue) {
    const job = await activeQueue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    if (state === "waiting" || state === "delayed" || state === "waiting-children") {
      await job.remove();
      return { state: "cancelled" };
    }
    if (state === "active") {
      const redisClient = await activeQueue.client;
      await redisClient.set(
        `${QUEUE_CANCEL_KEY_PREFIX}${jobId}`,
        "1",
        "EX",
        QUEUE_CANCEL_TTL_SECONDS,
      );
      return { state: "cancelled" };
    }
    if (state === "completed" && job.returnvalue?.cancelled) {
      return { state: "cancelled" };
    }
    return { state };
  }

  if (!mongoose.isValidObjectId(jobId)) return null;
  const cancelled = await RewardBatchDownloadJob.findOneAndUpdate(
    { _id: jobId, state: "active" },
    {
      $set: {
        state: "cancelled",
        error: "Reward batch download cancelled",
        finishedAt: new Date(),
        leaseUntil: null,
        expiresAt: new Date(Date.now() + INLINE_JOB_TTL_MS),
      },
    },
    { new: true },
  ).lean();
  if (cancelled) return { state: "cancelled" };
  const existing = await RewardBatchDownloadJob.findById(jobId).lean();
  return existing ? { state: existing.state } : null;
}

module.exports = {
  getRewardBatchDownloadQueue,
  initializeRewardBatchDownloadQueue,
  closeRewardBatchDownloadQueue,
  hasConfiguredSharedQueue,
  ensureInlineRewardBatchDownloadIndexes,
  getRewardBatchDownloadJob,
  cancelRewardBatchDownload,
  startInlineRewardBatchDownload,
};

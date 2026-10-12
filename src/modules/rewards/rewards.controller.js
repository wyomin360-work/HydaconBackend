const { sendResponse } = require("../../utils/responseHandlers");
const mongoose = require("mongoose");
const rewardService = require("./rewards.service");
const rewardBatchDownloadQueue = require("./reward-batch-download.queue");
const rewardBatchDownloadService = require("./reward-batch-download.service");
const { createHash } = require("crypto");
const { sendFailResponse } = require("../../utils/responseHandlers");

const archiveDownloadUrl = (req, archive) => {
  if (archive.downloadUrl) return archive.downloadUrl;
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  const host =
    req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  const fileName = encodeURIComponent(
    archive.fileName || "reward-batch-vouchers.zip",
  );
  return `${protocol}://${host}/reward-batch-downloads/${archive.token}?filename=${fileName}`;
};

async function enqueueRewardBatchZip(queue, batchId, rewardIds) {
  const normalizedRewardIds = Array.isArray(rewardIds)
    ? [...rewardIds].sort()
    : null;
  const jobId = `batchzip-${createHash("sha256")
    .update(JSON.stringify([String(batchId), normalizedRewardIds]))
    .digest("hex")}`;
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "failed") {
      await existing.remove();
    } else if (state === "completed") {
      const completedAt = existing.finishedOn || existing.timestamp;
      if (completedAt && Date.now() - completedAt < 50 * 60 * 1000) {
        const archiveAvailable = Boolean(
          existing.returnvalue &&
            (await rewardBatchDownloadService.isRewardBatchArchiveAvailable(
              existing.returnvalue,
            )),
        );
        if (archiveAvailable) return existing;
        if (existing.returnvalue?.cancelled) {
          const redisClient = await queue.client;
          await redisClient.del(
            `reward-batch-downloads:cancel:${jobId}`,
          );
        }
        console.warn("Cached reward ZIP is missing from S3; regenerating it", {
          jobId,
          s3Key: existing.returnvalue?.s3Key,
        });
      }
      await existing.remove();
    } else {
      return existing;
    }
  }

  try {
    return await queue.add(
      "generate-reward-batch-zip",
      { batchId, rewardIds },
      {
        jobId,
        attempts: 2,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: { age: 60 * 60, count: 1000 },
        removeOnFail: { age: 24 * 60 * 60, count: 1000 },
      },
    );
  } catch (error) {
    // A Redis timeout can happen after Redis accepted the add command. Recheck
    // the deterministic ID before using the inline fallback to avoid duplicate work.
    const acceptedJob = await queue.getJob(jobId).catch(() => null);
    if (acceptedJob) return acceptedJob;
    throw error;
  }
}

exports.listRewards = async (req, res) => {
  const data = req?.body;
  const response = await rewardService.listRewards(data);
  return sendResponse(res, response);
};

exports.listRewardsGroupedByDate = async (req, res) => {
  const data = req?.body;
  const response = await rewardService.listRewardsGroupedByDate(data);
  return sendResponse(res, response);
};

exports.listRewardBatches = async (req, res) => {
  const response = await rewardService.listRewardBatches(req?.body);
  return sendResponse(res, response);
};

exports.rewardBatchDetails = async (req, res) => {
  const response = await rewardService.getRewardBatch(req.params?.batchId);
  return sendResponse(res, response);
};

exports.listRewardsByBatch = async (req, res) => {
  const response = await rewardService.listRewardsByBatch(
    req.params?.batchId,
    req?.body,
  );
  return sendResponse(res, response);
};

exports.deactivateRewardBatch = async (req, res) => {
  const response = await rewardService.deactivateRewardBatch(
    req.params?.batchId,
  );
  return sendResponse(res, response);
};

exports.updateRewardBatch = async (req, res) => {
  const response = await rewardService.updateRewardBatch(
    req.params?.batchId,
    req?.body,
  );
  return sendResponse(res, response);
};

exports.deleteRewardBatch = async (req, res) => {
  const response = await rewardService.deleteRewardBatch(req.params?.batchId);
  return sendResponse(res, response);
};

exports.createRewardBatchDownload = async (req, res) => {
  const batchId = req.params?.batchId;
  const rewardIds = req.body?.rewardIds || null;
  if (!mongoose.isValidObjectId(batchId))
    sendFailResponse("invalid reward batch id", 400);
  if (
    rewardIds !== null &&
    (!Array.isArray(rewardIds) ||
      rewardIds.length < 1 ||
      rewardIds.length > 10000 ||
      rewardIds.some((id) => !mongoose.isValidObjectId(id)) ||
      new Set(rewardIds).size !== rewardIds.length)
  ) {
    sendFailResponse(
      "rewardIds must contain 1 to 10,000 unique valid reward IDs",
      400,
    );
  }
  const queue = rewardBatchDownloadQueue.getRewardBatchDownloadQueue();
  if (!queue && rewardBatchDownloadQueue.hasConfiguredSharedQueue()) {
    sendFailResponse(
      "Reward ZIP queue is temporarily unavailable. Please retry shortly.",
      503,
    );
  }
  if (queue) {
    try {
      // The stable job ID deduplicates clicks across app instances. Failed or
      // expired completed jobs are removed so a retry gets a fresh archive.
      const job = await enqueueRewardBatchZip(queue, batchId, rewardIds);
      return sendResponse(res, {
        data: { status: "processing", jobId: job.id },
      });
    } catch (error) {
      console.error("Unable to queue reward batch download:", error);
      if (rewardBatchDownloadQueue.hasConfiguredSharedQueue()) {
        sendFailResponse(
          "Reward ZIP queue is temporarily unavailable. Please retry shortly.",
          503,
        );
      }
    }
  }

  const jobId = await rewardBatchDownloadQueue.startInlineRewardBatchDownload(
    batchId,
    rewardIds,
  );
  return sendResponse(res, {
    data: { status: "processing", jobId },
  });
};

exports.rewardBatchDownloadStatus = async (req, res) => {
  const job = await rewardBatchDownloadQueue.getRewardBatchDownloadJob(
    req.params?.jobId,
  );
  if (!job && rewardBatchDownloadQueue.hasConfiguredSharedQueue()) {
    sendFailResponse(
      "Reward ZIP queue is temporarily unavailable. Please retry shortly.",
      503,
    );
  }
  if (!job) {
    sendFailResponse(
      "This ZIP request expired or was interrupted. Please start the download again.",
      410,
    );
  }
  if (job.state === "failed") {
    sendFailResponse(job.error || "reward batch download failed", 500);
  }
  if (job.state === "cancelled") {
    return sendResponse(res, {
      data: { status: "cancelled", jobId: req.params?.jobId },
    });
  }
  const result = job.result || {};
  const { s3Key, ...publicResult } = result;
  const downloadUrl = s3Key
    ? await rewardBatchDownloadService.refreshRewardBatchArchiveUrl({
        ...result,
        s3Key,
      })
    : result.downloadUrl ||
      (result.token ? archiveDownloadUrl(req, result) : undefined);
  return sendResponse(res, {
    data: {
      status: job.state === "completed" ? "completed" : "processing",
      jobId: req.params?.jobId,
      progress: job.progress ?? null,
      ...publicResult,
      ...(downloadUrl ? { downloadUrl } : {}),
    },
  });
};

exports.cancelRewardBatchDownload = async (req, res) => {
  if (
    !rewardBatchDownloadQueue.getRewardBatchDownloadQueue() &&
    rewardBatchDownloadQueue.hasConfiguredSharedQueue()
  ) {
    sendFailResponse(
      "Reward ZIP queue is temporarily unavailable. Please retry shortly.",
      503,
    );
  }
  const job = await rewardBatchDownloadQueue.cancelRewardBatchDownload(
    req.params?.jobId,
  );
  if (!job) sendFailResponse("reward batch download job not found", 404);
  if (job.state !== "cancelled") {
    sendFailResponse("reward batch download has already finished", 409);
  }
  return sendResponse(res, {
    data: { status: "cancelled", jobId: req.params?.jobId },
  });
};

exports.rewardDetails = async (req, res) => {
  const rewardId = req.params?.rewardId;
  const response = await rewardService.rewardDetails(rewardId);
  return sendResponse(res, response);
};

exports.createRewards = async (req, res) => {
  const data = req?.body;
  const response = await rewardService.createRewards(data);
  return sendResponse(res, response);
};

exports.updateReward = async (req, res) => {
  const data = req?.body;
  const rewardId = req.params?.rewardId;
  const response = await rewardService.updateReward(data, rewardId);
  return sendResponse(res, response);
};

exports.bulkUpdateRewards = async (req, res) => {
  const data = req?.body;
  const response = await rewardService.bulkUpdateRewards(data);
  return sendResponse(res, response);
};

exports.batchUpdateRewards = async (req, res) => {
  const data = req?.body;
  const response = await rewardService.batchUpdateRewards(data);
  return sendResponse(res, response);
};

exports.deleteReward = async (req, res) => {
  const rewardId = req?.params?.rewardId;
  const response = await rewardService.deleteReward(rewardId);
  return sendResponse(res, response);
};

exports.deleteAllReward = async (req, res) => {
  const response = await rewardService.deleteAllReward();
  return sendResponse(res, response);
};

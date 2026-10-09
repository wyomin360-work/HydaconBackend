const { sendResponse } = require("../../utils/responseHandlers");
const rewardService = require("./rewards.service");
const rewardBatchDownloadService = require("./reward-batch-download.service");
const rewardBatchDownloadQueue = require("./reward-batch-download.queue");
const { createHash } = require("crypto");
const { sendFailResponse } = require("../../utils/responseHandlers");

const archiveDownloadUrl = (req, archive) => {
  if (archive.downloadUrl) return archive.downloadUrl;
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  const fileName = encodeURIComponent(archive.fileName || "reward-batch-vouchers.zip");
  return `${protocol}://${host}/reward-batch-downloads/${archive.token}?filename=${fileName}`;
};

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
  const response = await rewardService.listRewardsByBatch(req.params?.batchId, req?.body);
  return sendResponse(res, response);
};

exports.deactivateRewardBatch = async (req, res) => {
  const response = await rewardService.deactivateRewardBatch(req.params?.batchId);
  return sendResponse(res, response);
};

exports.updateRewardBatch = async (req, res) => {
  const response = await rewardService.updateRewardBatch(req.params?.batchId, req?.body);
  return sendResponse(res, response);
};

exports.deleteRewardBatch = async (req, res) => {
  const response = await rewardService.deleteRewardBatch(req.params?.batchId);
  return sendResponse(res, response);
};

exports.createRewardBatchDownload = async (req, res) => {
  const batchId = req.params?.batchId;
  const rewardIds = req.body?.rewardIds || null;
  const queue = rewardBatchDownloadQueue.getRewardBatchDownloadQueue();
  if (queue) {
    try {
      // A stable BullMQ job ID makes duplicate clicks share one queued/active job
      // across all app instances connected to the same Redis queue.
      const normalizedRewardIds = Array.isArray(rewardIds) ? [...rewardIds].sort() : null;
      const jobId = `batchzip-${createHash("sha256")
        .update(JSON.stringify([String(batchId), normalizedRewardIds]))
        .digest("hex")}`;
      const job = await queue.add(
        "generate-reward-batch-zip",
        { batchId, rewardIds },
        {
          jobId,
          attempts: 2,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      );
      return sendResponse(res, {
        data: { status: "processing", jobId: job.id },
      });
    } catch (error) {
      console.error("Unable to queue reward batch download; generating inline:", error);
    }
  }

  const archive = await rewardBatchDownloadService.createRewardBatchArchive(
    batchId,
    undefined,
    rewardIds,
  );
  return sendResponse(res, {
    data: {
      status: "completed",
      ...archive,
      downloadUrl: archiveDownloadUrl(req, archive),
    },
  });
};

exports.rewardBatchDownloadStatus = async (req, res) => {
  const job = await rewardBatchDownloadQueue.getRewardBatchDownloadJob(req.params?.jobId);
  if (!job) sendFailResponse("reward batch download job not found", 404);
  if (job.state === "failed") {
    sendFailResponse(job.error || "reward batch download failed", 500);
  }
  const result = job.result || {};
  return sendResponse(res, {
    data: {
      status: job.state === "completed" ? "completed" : "processing",
      progress: typeof job.progress === "number" ? job.progress : 0,
      ...result,
      ...(result.downloadUrl || result.token
        ? {
            downloadUrl:
              archiveDownloadUrl(req, result),
          }
        : {}),
    },
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

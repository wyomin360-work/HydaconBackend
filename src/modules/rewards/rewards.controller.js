const { sendResponse } = require("../../utils/responseHandlers");
const rewardService = require("./rewards.service");

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

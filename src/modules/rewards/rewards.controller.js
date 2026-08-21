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

exports.deleteReward = async (req, res) => {
  const rewardId = req?.params?.rewardId;
  const response = await rewardService.deleteReward(rewardId);
  return sendResponse(res, response);
};

exports.deleteAllReward = async (req, res) => {
  const response = await rewardService.deleteAllReward();
  return sendResponse(res, response);
};

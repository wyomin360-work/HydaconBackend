const { sendResponse } = require("../../utils/responseHandlers");
const contestsService = require("./contests.service");

// Admin Controllers
exports.createContest = async (req, res) => {
  const data = req.body;
  const response = await contestsService.createContest(data);
  return sendResponse(res, response);
};

exports.updateContest = async (req, res) => {
  const data = req.body;
  const contestId = req.params.id;
  const response = await contestsService.updateContest(contestId, data);
  return sendResponse(res, response);
};

exports.listContests = async (req, res) => {
  const paginationData = req.body || req.query;
  const response = await contestsService.listContests(paginationData);
  return sendResponse(res, response);
};

exports.getContestById = async (req, res) => {
  const contestId = req.params.id;
  const response = await contestsService.getContestById(contestId);
  return sendResponse(res, response);
};

exports.deleteContest = async (req, res) => {
  const contestId = req.params.id;
  const response = await contestsService.deleteContest(contestId);
  return sendResponse(res, response);
};

exports.getContestAnalytics = async (req, res) => {
  const contestId = req.params.id;
  const response = await contestsService.getContestAnalytics(contestId);
  return sendResponse(res, response);
};

exports.getAdminLeaderboard = async (req, res) => {
  const contestId = req.params.id;
  const response = await contestsService.calculateLeaderboard(contestId);
  return sendResponse(res, response);
};

// User Controllers
exports.listUserContests = async (req, res) => {
  const userId = req.userId;
  const paginationData = req.body || req.query;
  const response = await contestsService.listUserContests(userId, paginationData);
  return sendResponse(res, response);
};

exports.getUserLeaderboard = async (req, res) => {
  const contestId = req.params.id;
  const userId = req.userId;
  const response = await contestsService.calculateLeaderboard(contestId, userId);
  return sendResponse(res, response);
};

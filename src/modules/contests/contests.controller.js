const contestsService = require("./contests.service");
const { sendResponse } = require("../../utils/responseHandlers");

// Admin
exports.adminCreateContest = async (req, res) => {
  const response = await contestsService.adminCreateContest(
    req.body,
    req.admin?._id,
  );
  return sendResponse(res, response);
};
exports.adminUpdateContest = async (req, res) => {
  const response = await contestsService.adminUpdateContest(
    req.params.contestId,
    req.body,
  );
  return sendResponse(res, response);
};
exports.adminDeleteContest = async (req, res) => {
  const response = await contestsService.adminDeleteContest(
    req.params.contestId,
  );
  return sendResponse(res, response);
};
exports.adminListContests = async (req, res) => {
  const response = await contestsService.adminListContests(req.query);
  return sendResponse(res, response);
};
exports.adminGetContestSummary = async (req, res) => {
  const response = await contestsService.adminGetContestSummary();
  return sendResponse(res, response);
};
exports.adminGetContestDetails = async (req, res) => {
  const response = await contestsService.adminGetContestDetails(
    req.params.contestId,
  );
  return sendResponse(res, response);
};
exports.adminFinaliseContest = async (req, res) => {
  const adminId = req.admin?._id || req.admin?.id || req.user?._id;
  const response = await contestsService.adminFinaliseContest(
    req.params.contestId,
    adminId,
  );
  return sendResponse(res, response);
};
exports.adminCancelContest = async (req, res) => {
  const adminId = req.admin?._id || req.admin?.id || req.user?._id;
  const response = await contestsService.adminCancelContest(
    req.params.contestId,
    adminId,
  );
  return sendResponse(res, response);
};

// User
exports.userListContests = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const response = await contestsService.userListContests(req.query, userId);
  return sendResponse(res, response);
};
exports.userGetContestDetails = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const response = await contestsService.userGetContestDetails(
    req.params.contestId,
    userId,
  );
  return sendResponse(res, response);
};
exports.userGetLeaderboard = async (req, res) => {
  const response = await contestsService.userGetLeaderboard(
    req.params.contestId,
  );
  return sendResponse(res, response);
};
exports.generalLeaderboard = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const response = await contestsService.generalLeaderboard(userId);
  return sendResponse(res, response);
};
exports.userClaimReward = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const response = await contestsService.userClaimReward(
    req.params.contestId,
    userId,
  );
  return sendResponse(res, response);
};

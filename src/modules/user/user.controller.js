const { sendResponse } = require("../../utils/responseHandlers");
const userService = require("./user.service");
const { parseUserAgent } = require("../../utils/heplers");

exports.register = async (req, res, next) => {
  let data = req?.body;
  const response = await userService.registerUser(data);
  return sendResponse(res, response);
};

exports.login = async (req, res, next) => {
  let data = req?.body;
  const response = await userService.login(data);
  return sendResponse(res, response);
};

exports.providerAuth = async (req, res, next) => {
  let data = req?.body;
  const response = await userService.providerAuth(data);
  return sendResponse(res, response);
};

exports.logout = async (req, res, next) => {
  let userId = req?.userId;
  const response = await userService.logout(userId);
  return sendResponse(res, response);
};

exports.verifyEmail = async (req, res, next) => {
  let body = req?.body;
  const response = await userService.verifyEmail(body);
  return sendResponse(res, response);
};

exports.verifyOtp = async (req, res, next) => {
  let body = req?.body;
  const response = await userService.verifyOtp(body);
  return sendResponse(res, response);
};

exports.verifyOldNumber = async (req, res, next) => {
  const userId = req?.userId;
  const body = req?.body || {};
  const response = await userService.verifyOldNumber(body, userId);
  return sendResponse(res, response);
};

exports.verifyNewNumber = async (req, res, next) => {
  const userId = req?.userId;
  const body = req?.body || {};
  const forwardedFor = req.headers["x-forwarded-for"];
  const ipAddress =
    (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
      ?.split(",")?.[0]
      ?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    null;

  const userAgent = req.headers["user-agent"] || "";
  const parsed = parseUserAgent(userAgent, req.headers);
  const deviceInfo = {
    userAgent: userAgent || null,
    deviceId: parsed.deviceId || null,
    deviceName: parsed.deviceName || null,
    platform: parsed.platform || null,
    appVersion: parsed.appVersion || null,
  };

  const response = await userService.verifyNewNumber(
    body,
    userId,
    ipAddress,
    deviceInfo,
  );
  return sendResponse(res, response);
};

exports.resetPassword = async (req, res, next) => {
  let body = req?.body;
  const response = await userService.updatePassword(body);
  return sendResponse(res, response);
};

exports.simpleLoginWithOtp = async (req, res, next) => {
  const data = req?.body;
  const response = await userService.simpleLoginWithOtp(data);
  return sendResponse(res, response);
};

// ------------------------------------------------------

exports.userDetails = async (req, res, next) => {
  let userId = req?.userId;
  const response = await userService.getUserDetails(userId);
  return sendResponse(res, response);
};

exports.getAdminUserDetails = async (req, res, next) => {
  const targetUserId = req?.params?.id;
  const response = await userService.getAdminUserDetails(targetUserId);
  return sendResponse(res, response);
};

exports.updateProfile = async (req, res, next) => {
  let userId = req?.userId;
  let data = req?.body;
  const response = await userService.updateUserProfile(data, userId);
  return sendResponse(res, response);
};

exports.updatePreferences = async (req, res, next) => {
  let userId = req?.userId;
  let data = req?.body;
  const response = await userService.updatePreferences(data, userId);
  return sendResponse(res, response);
};

exports.addFcmToken = async (req, res, next) => {
  let userId = req?.userId;
  let data = req?.body;
  const response = await userService.addFcmToken(data, userId);
  return sendResponse(res, response);
};

// ---------------------------------------------------------

exports.userBankDetails = async (req, res, next) => {
  let userId = req?.userId;
  const response = await userService.getUserBankDetails(userId);
  return sendResponse(res, response);
};

exports.addBankDetails = async (req, res, next) => {
  let userId = req?.userId;
  let data = req?.body;
  const response = await userService.addUserBankDetails(data, userId);
  return sendResponse(res, response);
};

exports.updateBankDetails = async (req, res, next) => {
  let userId = req?.userId;
  let data = req?.body;
  const response = await userService.updateBankDetails(data, userId);
  return sendResponse(res, response);
};

exports.deleteBankDetails = async (req, res, next) => {
  let userId = req?.userId;
  const response = await userService.deleteBankDetails(userId);
  return sendResponse(res, response);
};

exports.userList = async (req, res) => {
  const data = req?.body;
  const response = await userService.userList(data);
  return sendResponse(res, response);
};

exports.uploadProfilePhoto = async (req, res, next) => {
  const userId = req?.userId;
  const { fileUrl } = req?.body;
  const response = await userService.uploadProfilePhoto(userId, fileUrl);
  return sendResponse(res, response);
};

exports.flagUser = async (req, res, next) => {
  const targetUserId = req?.params?.id;
  const data = req?.body;
  const response = await userService.flagUser(targetUserId, data);
  return sendResponse(res, response);
};

exports.convertPoints = async (req, res, next) => {
  const userId = req?.userId;
  const data = req?.body;
  const response = await userService.convertPointsToCoins(userId, data);
  return sendResponse(res, response);
};

exports.conversionHistory = async (req, res, next) => {
  const userId = req?.userId;
  const response = await userService.getConversionHistory(userId);
  return sendResponse(res, response);
};

exports.pointsLedger = async (req, res, next) => {
  const userId = req?.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const response = await userService.getPointsLedger(userId, page, limit);
  return sendResponse(res, response);
};

exports.toggleUserStatus = async (req, res, next) => {
  const targetUserId = req?.params?.id;
  const data = req?.body;
  const response = await userService.toggleUserStatus(targetUserId, data);
  return sendResponse(res, response);
};

exports.deleteUser = async (req, res, next) => {
  const userId = req.params?.id;
  const response = await userService.deleteUser(userId);
  return sendResponse(res, response);
};

exports.releaseBan = async (req, res, next) => {
  const userId = req.params?.id;
  const response = await userService.releaseBan(userId);
  return sendResponse(res, response);
};

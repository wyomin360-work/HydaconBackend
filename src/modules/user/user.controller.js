const { sendResponse } = require("../../utils/responseHandlers");
const userService = require("./user.service");

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

exports.resetPassword = async (req, res, next) => {
  let body = req?.body;
  const response = await userService.updatePassword(body);
  return sendResponse(res, response);
};

// ------------------------------------------------------

exports.userDetails = async (req, res, next) => {
  let userId = req?.userId;
  const response = await userService.getUserDetails(userId);
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
  const file = req?.file;
  const response = await userService.uploadProfilePhoto(userId, file);
  return sendResponse(res, response);
};

exports.flagUser = async (req, res, next) => {
  const targetUserId = req?.params?.id;
  const data = req?.body;
  const response = await userService.flagUser(targetUserId, data);
  return sendResponse(res, response);
};

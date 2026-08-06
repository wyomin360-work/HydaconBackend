const { sendResponse } = require("../../utils/responseHandlers");
const service = require("./withdrawals.service");

exports.createWithdrawal = async (req, res, next) => {
  const userId = req.userId;
  const data = req.body;
  const result = await service.createWithdrawal(userId, data);
  return sendResponse(res, result);
};

exports.getWithdrawalHistory = async (req, res, next) => {
  const userId = req.userId;
  const result = await service.getWithdrawalHistory(userId);
  return sendResponse(res, result);
};

exports.getWithdrawalDetailsUser = async (req, res, next) => {
  const { id } = req.params;
  const userId = req.userId;
  const result = await service.getWithdrawalDetailsUser(id, userId);
  return sendResponse(res, result);
};

exports.listWithdrawals = async (req, res, next) => {
  const data = req.body || {};
  const result = await service.listWithdrawals(data);
  return sendResponse(res, result);
};

exports.getWithdrawalDetails = async (req, res, next) => {
  const { id } = req.params;
  const result = await service.getWithdrawalDetails(id);
  return sendResponse(res, result);
};

exports.getWithdrawalsSummary = async (req, res, next) => {
  const result = await service.getWithdrawalsSummary();
  return sendResponse(res, result);
};

exports.approveWithdrawal = async (req, res, next) => {
  const { id } = req.params;
  const adminId = req.userId; // verifyAdmin injects userId (representing admin ID)
  const result = await service.approveWithdrawal(adminId, id);
  return sendResponse(res, result);
};

exports.cancelWithdrawal = async (req, res, next) => {
  const { id } = req.params;
  const adminId = req.userId;
  const data = req.body || {};
  const result = await service.cancelWithdrawal(adminId, id, data);
  return sendResponse(res, result);
};

const { sendResponse } = require("../../utils/responseHandlers");
const service = require("./payouts.admin.service");

exports.listPayouts = async (req, res) => {
  const result = await service.listPayouts(req.body || {});
  return sendResponse(res, result);
};

exports.getPayoutSummary = async (_req, res) => {
  const result = await service.getPayoutSummary();
  return sendResponse(res, result);
};

exports.getPayoutDetails = async (req, res) => {
  const result = await service.getPayoutDetails(req.params.id);
  return sendResponse(res, result);
};

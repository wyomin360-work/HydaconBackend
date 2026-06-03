const { sendResponse } = require("../../utils/responseHandlers");
const campaignsService = require("./campaigns.service");

const listCampaignsForUser = async (req, res, next) => {
  const userId = req.userId;
  const data = await campaignsService.listCampaignsForUser(userId);
  return sendResponse(res, data);
};

const listCampaignsAdmin = async (req, res, next) => {
  const adminId = req.userId;
  const data = await campaignsService.listCampaignsAdmin(adminId, req.query);
  return sendResponse(res, data);
};

const createCampaign = async (req, res, next) => {
  const adminId = req.userId;
  const data = await campaignsService.createCampaign(adminId, req.body);
  return sendResponse(res, data);
};

const updateCampaign = async (req, res, next) => {
  const adminId = req.userId;
  const { id } = req.params;
  const data = await campaignsService.updateCampaign(adminId, id, req.body);
  return sendResponse(res, data);
};

const deleteCampaign = async (req, res, next) => {
  const adminId = req.userId;
  const { id } = req.params;
  const data = await campaignsService.deleteCampaign(adminId, id);
  return sendResponse(res, data);
};

module.exports = {
  listCampaignsForUser,
  listCampaignsAdmin,
  createCampaign,
  updateCampaign,
  deleteCampaign,
};

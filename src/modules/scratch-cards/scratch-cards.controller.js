const { sendResponse } = require("../../utils/responseHandlers");
const scratchCardsService = require("./scratch-cards.service");

// Admin Controllers
exports.createCampaign = async (req, res) => {
  const data = req.body;
  const response = await scratchCardsService.createCampaign(data);
  return sendResponse(res, response);
};

exports.updateCampaign = async (req, res) => {
  const data = req.body;
  const campaignId = req.params.id;
  const response = await scratchCardsService.updateCampaign(campaignId, data);
  return sendResponse(res, response);
};

exports.listCampaigns = async (req, res) => {
  const paginationData = req.body || req.query; // Fallback to query
  const response = await scratchCardsService.listCampaigns(paginationData);
  return sendResponse(res, response);
};

exports.getCampaignById = async (req, res) => {
  const campaignId = req.params.id;
  const response = await scratchCardsService.getCampaignById(campaignId);
  return sendResponse(res, response);
};

exports.deleteCampaign = async (req, res) => {
  const campaignId = req.params.id;
  const response = await scratchCardsService.deleteCampaign(campaignId);
  return sendResponse(res, response);
};

exports.getCampaignStats = async (req, res) => {
  const campaignId = req.params.id;
  const response = await scratchCardsService.getCampaignStats(campaignId);
  return sendResponse(res, response);
};

// User Controllers
exports.listUserScratchCards = async (req, res) => {
  const userId = req.userId;
  const paginationData = req.body || req.query;
  const response = await scratchCardsService.listUserScratchCards(userId, paginationData);
  return sendResponse(res, response);
};

exports.revealScratchCard = async (req, res) => {
  const userId = req.userId;
  const scratchCardId = req.params.id;
  const response = await scratchCardsService.revealScratchCard(userId, scratchCardId);
  return sendResponse(res, response);
};

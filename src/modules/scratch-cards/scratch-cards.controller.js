const scratchCardsService = require("./scratch-cards.service");
const { sendResponse } = require("../../utils/responseHandlers");
const { ROLES } = require("../../constants/common");

exports.listScratchCards = async (req, res) => {
  const isAdmin = req.role === ROLES.ADMIN || !!req.admin;
  const userId = isAdmin ? req.body?.userId : req.userId;

  const data = {
    userId,
    page: Math.max(1, parseInt(req.body?.page) || 1),
    limit: Math.max(1, parseInt(req.body?.limit) || 15),
    startDate: req.body?.startDate,
    endDate: req.body?.endDate,
    scratchCardCampaignId: req.body?.scratchCardCampaignId,
  };
  const response = await scratchCardsService.listScratchCards(data, isAdmin);
  return sendResponse(res, response);
};

exports.scratchCard = async (req, res) => {
  const scratchCardId = req.params?.id;
  const userId = req.userId || req.user?.id;
  const response = await scratchCardsService.scratchCard(scratchCardId, userId);
  return sendResponse(res, response);
};

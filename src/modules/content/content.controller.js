const { sendResponse } = require("../../utils/responseHandlers");
const contentService = require("./content.service");
const { verifyToken } = require("../../utils/heplers");

const getOptionalUserId = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const verifiedToken = verifyToken(token);
    return verifiedToken ? verifiedToken.userId : null;
  }
  return null;
};

const createContent = async (req, res, next) => {
  const data = await contentService.createContent(req.body);
  return sendResponse(res, data, 201);
};

const updateContent = async (req, res, next) => {
  const { id } = req.params;
  const data = await contentService.updateContent(id, req.body);
  return sendResponse(res, data);
};

const deleteContent = async (req, res, next) => {
  const { id } = req.params;
  const data = await contentService.deleteContent(id);
  return sendResponse(res, data);
};

const listContentAdmin = async (req, res, next) => {
  const data = await contentService.listContent(req.query);
  return sendResponse(res, data);
};

const getHomepageContent = async (req, res, next) => {
  const userId = getOptionalUserId(req);
  const data = await contentService.getHomepageContent(userId);
  return sendResponse(res, data);
};

const getPlacementContent = async (req, res, next) => {
  const { placement } = req.params;
  const userId = getOptionalUserId(req);
  const data = await contentService.getPlacementContent(placement, userId);
  return sendResponse(res, data);
};

const trackContentView = async (req, res, next) => {
  const { id } = req.params;
  const userId = req.userId;
  const data = await contentService.trackContentView(id, userId);
  return sendResponse(res, data);
};

const getContentDetails = async (req, res, next) => {
  const { id } = req.params;
  const data = await contentService.getContentDetails(id);
  return sendResponse(res, data);
};

module.exports = {
  createContent,
  updateContent,
  deleteContent,
  listContentAdmin,
  getHomepageContent,
  getPlacementContent,
  trackContentView,
  getContentDetails,
};

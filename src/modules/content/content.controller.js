const { sendResponse } = require("../../utils/responseHandlers");
const contentService = require("./content.service");

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
  const data = await contentService.getHomepageContent();
  return sendResponse(res, data);
};

const getPlacementContent = async (req, res, next) => {
  const { placement } = req.params;
  const data = await contentService.getPlacementContent(placement);
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
  getContentDetails,
};

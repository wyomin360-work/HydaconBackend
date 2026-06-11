const { sendResponse } = require("../../utils/responseHandlers");
const giftService = require("./gift.service");

// Categories
exports.listCategories = async (req, res) => {
  const paginationData = req?.body;
  const response = await giftService.categoryList(paginationData);
  return sendResponse(res, response);
};

exports.createCategory = async (req, res) => {
  const categoryData = req?.body;
  const response = await giftService.createCategory(categoryData);
  return sendResponse(res, response);
};

exports.updateCategory = async (req, res) => {
  const categoryData = req?.body;
  const categoryId = req.params?.categoryId;
  const response = await giftService.updateCategory(categoryData, categoryId);
  return sendResponse(res, response);
};

exports.deleteCategory = async (req, res) => {
  const categoryId = req.params?.categoryId;
  const response = await giftService.deleteCategory(categoryId);
  return sendResponse(res, response);
};

// Gifts (Admin)
exports.adminListGifts = async (req, res) => {
  const paginationData = req?.body;
  const response = await giftService.giftList(paginationData, true); // true for admin (shows inactive)
  return sendResponse(res, response);
};

exports.getGiftDetails = async (req, res) => {
  const giftId = req.params?.giftId;
  const response = await giftService.getGiftDetails(giftId);
  return sendResponse(res, response);
};

exports.createGift = async (req, res) => {
  const giftData = req?.body;
  const response = await giftService.createGift(giftData);
  return sendResponse(res, response);
};

exports.updateGift = async (req, res) => {
  const giftData = req?.body;
  const giftId = req.params?.giftId;
  const response = await giftService.updateGift(giftData, giftId);
  return sendResponse(res, response);
};

exports.deleteGift = async (req, res) => {
  const giftId = req.params?.giftId;
  const response = await giftService.deleteGift(giftId);
  return sendResponse(res, response);
};

// Gifts (User)
exports.userListGifts = async (req, res) => {
  const paginationData = req?.body;
  const response = await giftService.giftList(paginationData, false); // false for user (only active)
  return sendResponse(res, response);
};

// Redemptions
exports.redeemGift = async (req, res) => {
  const userId = req.userId;
  const data = req.body;
  const response = await giftService.redeemGift(userId, data);
  return sendResponse(res, response);
};

exports.userRedemptions = async (req, res) => {
  const userId = req.userId;
  const paginationData = req.body;
  const response = await giftService.userRedemptions(userId, paginationData);
  return sendResponse(res, response);
};

exports.adminRedemptionList = async (req, res) => {
  const paginationData = req.body;
  const response = await giftService.adminRedemptionList(paginationData);
  return sendResponse(res, response);
};

exports.adminUpdateRedemption = async (req, res) => {
  const redemptionId = req.params.redemptionId;
  const data = req.body;
  const response = await giftService.adminUpdateRedemption(redemptionId, data);
  return sendResponse(res, response);
};

exports.getAnalytics = async (req, res) => {
  const response = await giftService.getAnalytics();
  return sendResponse(res, response);
};

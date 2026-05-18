const { sendResponse } = require("../../utils/responseHandlers");
const commonService = require("./common.service");

exports.uploadImage = async (req, res) => {
  const fileData = req?.file;
  const response = await commonService.uploadImage(fileData);
  return sendResponse(res, response);
};

exports.renewToken = async (req, res) => {
  const data = req?.body;
  const response = await commonService.renewToken(data);
  return sendResponse(res, response);
};

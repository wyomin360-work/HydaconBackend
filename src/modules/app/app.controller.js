const { sendResponse } = require("../../utils/responseHandlers");
const appService = require("./app.service");

exports.appConfigurations = async (req, res, next) => {
  const response = await appService.appConfigurations();
  return sendResponse(res, response);
};

exports.updateAppConfig = async (req, res, next) => {
  const data = req?.body;
  const adminId = req?.adminId;
  const response = await appService.updateAppConfig(data, adminId);
  return sendResponse(res, response);
};

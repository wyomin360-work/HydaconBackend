const { sendResponse } = require("../../utils/responseHandlers");
const roleService = require("./role.service");

exports.createRole = async (req, res) => {
  const data = req.body;
  const response = await roleService.createRole(data);
  return sendResponse(res, response);
};

exports.getRoles = async (req, res) => {
  const filters = req.query;
  const response = await roleService.getAllRoles(filters);
  return sendResponse(res, response);
};

exports.getPublicRoles = async (req, res) => {
  const response = await roleService.getPublicRoles();
  return sendResponse(res, response);
};

exports.updateRole = async (req, res) => {
  const { roleId } = req.params;
  const data = req.body;
  const response = await roleService.updateRole(roleId, data);
  return sendResponse(res, response);
};

exports.deleteRole = async (req, res) => {
  const { roleId } = req.params;
  const response = await roleService.deleteRole(roleId);
  return sendResponse(res, response);
};

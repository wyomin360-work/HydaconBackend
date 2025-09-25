const { sendResponse } = require('../../utils/responseHandlers')
const adminService = require('./admin.service')


exports.register = async (req, res, next) => {
    let data = req?.body;
     let createdBy = req?.userId;
    const response = await adminService.registerAdmin(data,createdBy)
    return sendResponse(res, response)
}

exports.login = async (req, res, next) => {
    let data = req?.body
    const response = await adminService.login(data)
    return sendResponse(res, response)
}

exports.logout = async (req, res, next) => {
    let adminId = req?.userId
    const response = await adminService.logout(adminId)
    return sendResponse(res, response)
}
exports.forgotPassword = async (req, res, next) => {
    const { email } = req.body;
    const response = await adminService.forgotPassword(email);
    return sendResponse(res, response);
}

exports.resetPassword = async (req, res, next) => {
    const { token, newPassword } = req.body;
    const response = await adminService.resetPassword(token, newPassword);
    return sendResponse(res, response);
}
exports.updateDetails = async (req, res, next) => {
    const adminId = req?.userId;
    const data = req?.body;
    const response = await adminService.updateDetails(adminId, data);
    return sendResponse(res, response);
};

exports.adminList = async (req, res) => {
    const data = req?.body;
    const response = await adminService.adminList(data);
    return sendResponse(res, response);
};
const { sendResponse } = require('../../utils/responseHandlers')
const adminService = require('./admin.service')


exports.register = async (req, res, next) => {
    let data = req?.body
    const response = await adminService.registerAdmin(data)
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

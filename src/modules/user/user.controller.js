const { sendResponse } = require('../../utils/responseHandlers')
const userService = require('./user.service')


exports.register = async (req, res, next) => {
    let data = req?.body
    const response = await userService.registerUser(data)
    return sendResponse(res, response)
}

exports.login = async (req, res, next) => {
    let data = req?.body
    const response = await userService.login(data)
    return sendResponse(res, response)
}

exports.logout = async (req, res, next) => {
    let userId = req?.userId
    const response = await userService.logout(userId)
    return sendResponse(res, response)
}
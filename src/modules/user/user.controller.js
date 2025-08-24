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

exports.verifyEmail = async (req, res, next) => {
    let body = req?.body
    const response = await userService.verifyEmail(body)
    return sendResponse(res, response)
}

exports.verifyOtp = async (req, res, next) => {
    let body = req?.body
    const response = await userService.verifyOtp(body)
    return sendResponse(res, response)
}

exports.resetPassword = async (req, res, next) => {
    let body = req?.body
    const response = await userService.updatePassword(body)
    return sendResponse(res, response)
}
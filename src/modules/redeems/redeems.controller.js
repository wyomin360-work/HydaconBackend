const redeemService = require('./redeems.service') 
const { sendResponse } = require('../../utils/responseHandlers')

exports.listRedeems = async (req, res) => {
    const data = req?.body
    const response = await redeemService.listRedeems(data)
    return sendResponse(res, response)
}

exports.redeemDetails = async (req, res) => {
    const redeemId = req.params?.redeemId
    const response = await redeemService.redeemDetails(redeemId)
    return sendResponse(res, response)
}

exports.createRedeem = async (req, res) => {
    const redeemData = req?.body
    const response = await redeemService.createRedeem(redeemData)
    return sendResponse(res, response)
}

exports.deleteRedeem = async (req, res) => {
    const redeemId = req.params?.redeemId
    const response = await redeemService.deleteRedeem(redeemId)
    return sendResponse(res, response)
}

const { sendResponse } = require("../../utils/responseHandlers")
const commonService = require('./common.service')

exports.uploadImage = async (req, res) => {
    const fileData = req?.file
    const response = await commonService.uploadImage(fileData)
    return sendResponse(res, response)
}

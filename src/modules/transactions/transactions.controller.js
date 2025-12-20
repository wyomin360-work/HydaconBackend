const { ROLES } = require("../../constants/common")
const { sendResponse } = require("../../utils/responseHandlers")
const transactionService = require('./transactions.service')

exports.transactionList = async (req, res, next) => {
    const data = req?.body
    const adminId = req?.role === ROLES.ADMIN ? req?.userId : null
    const response = await transactionService.listTransactions(data, adminId)
    return sendResponse(res, response)
}

exports.transactionDetails = async (req, res, next) => {
    const transactionId = req?.params?.transactionId
    const response = await transactionService.transactionDetails(transactionId)
    return sendResponse(res, response)
}

exports.createTransaction = async (req, res, next) => {
    const data = req?.body
    const userId = req?.userId
    const response = await transactionService.createTransaction(data, userId)
    return sendResponse(res, response)
}

exports.updateTransaction = async (req, res, next) => {
    const data = req?.body
    const transactionId = req?.params?.transactionId
    const response = await transactionService.updateTransaction(data, transactionId)
    return sendResponse(res, response)
}

exports.deleteTransaction = async (req, res, next) => {
    const transactionId = req?.params?.transactionId
    const response = await transactionService.deleteTransaction(transactionId)
    return sendResponse(res, response)
}

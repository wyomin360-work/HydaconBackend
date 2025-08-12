const AppError = require('./appError')

const sendResponse = (res, data = {}, statusCode = 200) => {
    return res.status(statusCode).json({
        status: 'success',
        data
    })
}

const sendFailResponse = (message, statusCode = 400) => {
    throw new AppError(message, statusCode)
}

module.exports = { sendFailResponse, sendResponse }
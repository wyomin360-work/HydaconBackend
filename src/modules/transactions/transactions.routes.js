const express = require('express')
const transactionsPath = require('./transactions.path')
const verification = require("../../middlewares/jwtVerification");
const { handleError } = require('../../utils/heplers');
const controller = require('./transactions.controller')


const router = express.Router()

router.post(
    transactionsPath.list,
    verification.verifyAdminOrUser,
    handleError(controller.transactionList)
)

router.get(
    transactionsPath.details,
    verification.verifyAdminOrUser,
    handleError(controller.transactionDetails)
)

router.post(
    transactionsPath.create,
    verification.verifyUser,
    handleError(controller.createTransaction)
)

router.patch(
    transactionsPath.update,
    verification.verifyAdmin,
    handleError(controller.updateTransaction)
)

router.delete(
    transactionsPath.delete,
    verification.verifyAdmin,
    handleError(controller.deleteTransaction)
)

module.exports = router
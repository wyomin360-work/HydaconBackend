const { PAYMENT_STATUS, SORT_OPTIONS, PAYMENT_METHODS } = require("../../constants/transactions")
const AppConfig = require("../../schemas/app-config.schema")
const Transactions = require("../../schemas/transaction.schema")
const User = require("../../schemas/user.schema")
const { decrypt, encrypt } = require("../../utils/encryption")
const { sendFailResponse } = require("../../utils/responseHandlers")

// ----------------------
// Transaction List
// ----------------------
async function listTransactions(data) {
    const { page, limit, sortBy, status, userId } = data
    let skip = (page - 1) * limit

    let query = {}
    let sortOptions = { createdAt: -1 }

    if (status) {
        query.status = status
    }

    if (userId) {
        query.userId = userId
    }

    if (sortBy) {
        if (sortBy === SORT_OPTIONS.MOST_RECENT) {
            sortOptions.createdAt = -1
        }
        if (sortBy === SORT_OPTIONS.AMOUNT) {
            sortOptions.amount = -1
        }
    }

    const transactions = await Transactions
        .find(query)
        .select('-bankDetails')
        .populate({ path: 'user', select: "name email " })
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean()

    const totalItems = await Transactions.countDocuments()
    const totalPages = Math.ceil(totalItems / limit)

    return {
        transactions,
        currentPage: page,
        limit,
        totalPages,
        totalItems,
        isNext: page < totalPages,
        isPrevious: page > 1,
        isData: transactions?.length > 0
    }
}

// ----------------------
// Transaction  Details
// ----------------------
async function transactionDetails(transactionId) {
    const transaction = await Transactions
        .findById(transactionId)
        .populate({ path: "user", select: "name email" })
        .lean()

    if (!transaction) sendFailResponse('Transaction not found')

    const accountNumber = decrypt(transaction.bankDetails.accountNumber, transaction.bankDetails?.accountIv)
    const ifscCode = decrypt(transaction.bankDetails?.ifscCode, transaction.bankDetails?.ifscIv)

    if (!accountNumber || !ifscCode)
        sendFailResponse('Unable to get user bank details')

    const { ifscIv, accountIv, ...rest } = transaction.bankDetails

    let bankDetails = {
        ...rest,
        accountNumber,
        ifscCode
    }

    return {
        ...transaction,
        bankDetails
    }
}

// ----------------------
// Create Transaction 
// ----------------------
async function createTransaction(data, userId) {
    const { amount } = data
    const user = await User.findById(userId)
    if (!user) sendFailResponse('User not found')
    if (!user.bankDetails?.accountNumber) sendFailResponse('Add bank details to withdraw amount')

    const appConfig = await AppConfig.find().lean()
    if (!appConfig || !appConfig[0]?.coinSettings) sendFailResponse("Failed to create withdraw request");

    let coinConfig = appConfig[0]?.coinSettings
    let userValidAmount = Math.ceil(user.totalPoints * coinConfig?.coinValue)
    if (amount > userValidAmount) sendFailResponse(`Amount exceeds your actual ${userValidAmount} rupees redeemable amount `)

    if (amount > coinConfig?.maxWithdrawAmount) sendFailResponse(`Amount exceeds maximum withdraw limit of ${coinConfig?.maxWithdrawAmount} rupees `)

    if (amount < coinConfig?.minWithdrawAmount) sendFailResponse(`Amount less than minimum withdraw of ${coinConfig?.minWithdrawAmount} rupees`)

    const accountNumber = decrypt(user.bankDetails.accountNumber, user.bankDetails?.accountIv)
    const ifscCode = decrypt(user.bankDetails?.ifscCode, user.bankDetails?.ifscIv)
    if (!accountNumber || !ifscCode)
        sendFailResponse('Unable to get user bank details')

    const encryptedAccountNumber = encrypt(accountNumber)
    const encryptedIfscCode = encrypt(ifscCode)
    if (!encryptedAccountNumber || !encryptedIfscCode)
        sendFailResponse('Unable to process bank details , try again')

    let bankDetails = {
        accountNumber: encryptedAccountNumber.encryptedData,
        accountIv: encryptedAccountNumber.iv,
        ifscCode: encryptedIfscCode.encryptedData,
        ifscIv: encryptedIfscCode.iv,
        userName: user.bankDetails?.userName,
        branchName: user.bankDetails?.branchName,
        bankName: user.bankDetails?.bankName
    }

    await Transactions.create({
        amount,
        userId,
        bankDetails,
        paymentMethod: PAYMENT_METHODS.DIRECT_TRANSFER
    })

    let userRemainingPoints = user.totalPoints - Math.ceil((amount / coinConfig.coinValue))
    user.totalPoints = userRemainingPoints
    await user.save()
    return {
        message: "Withdraw request created",
        data: { withdrawRequested: true }
    }
}

// ----------------------
// Update Transaction 
// ----------------------
async function updateTransaction(data, transactionId) {
    const { status, userId } = data

    const user = await User.findById(userId)
    if (!user) sendFailResponse('User not found')

    const transaction = await Transactions.findById(transactionId)
    if (!transaction) sendFailResponse('Invalid transaction id')
    if (transaction.status !== PAYMENT_STATUS.INITIATED)
        sendFailResponse(`can't update ${transaction.status?.toLowerCase()} transaction`)

    if (status === PAYMENT_STATUS.CANCELLED) {

        if (!data?.cancellationReason || data?.cancellationReason?.length < 5)
            sendFailResponse('Add valid cancellation reason')

        transaction.status = PAYMENT_STATUS.CANCELLED
        transaction.cancellationReason = data?.cancellationReason
    } else if (status === PAYMENT_STATUS.FAILED) {

        if (!data?.failureReason || data?.failureReason?.length < 5)
            sendFailResponse('Add valid reason for failure')

        transaction.status = PAYMENT_STATUS.FAILED
        transaction.failureReason = data?.failureReason
    } else if (status === PAYMENT_STATUS.PAID) {

        if (!data?.transactionId) sendFailResponse('Add transaction id')

        transaction.status = PAYMENT_STATUS.PAID
        transaction.transactionId = data?.transactionId
        transaction.paidAt = new Date()
        user.totalWithdraw = (user.totalWithdraw + transaction.amount)
    }
    await transaction.save()
    await user.save()
    return { message: 'Transaction status updated', data: { transactionStatusUpdated: true } }
}

async function deleteTransaction(transactionId) {
    await Transactions.findByIdAndDelete(transactionId)
    return { message: 'Transaction deleted successfully', data: { transactionDeleted: true } }
}

module.exports = {
    createTransaction,
    updateTransaction,
    listTransactions,
    transactionDetails,
    deleteTransaction
}
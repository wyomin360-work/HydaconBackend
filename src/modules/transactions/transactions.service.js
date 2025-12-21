//service
const { PAYMENT_STATUS, SORT_OPTIONS, PAYMENT_METHODS } = require("../../constants/transactions")
const { APP_NOTIFICATIONS } = require('../../constants/notifications')
const Admin = require("../../schemas/admin.schema")
const AppConfig = require("../../schemas/app-config.schema")
const Transactions = require("../../schemas/transaction.schema")
const User = require("../../schemas/user.schema")
const { decrypt, encrypt } = require("../../utils/encryption")
const { attachId, formatNotification } = require("../../utils/heplers")
const { sendFailResponse } = require("../../utils/responseHandlers")
const { sendFcmNotifications } = require("../../functions/fcm")

// ----------------------
// Transaction List
// ----------------------
async function listTransactions(data,adminId) {
    const { 
        page = 1, 
        limit = 10, 
        search = "", 
        sortBy = "createdAt", 
        sortOrder = "desc", 
        filters = {}, 
        userId,  
    } = data;

    let skip = (page - 1) * limit;
    let query = {};
    let sortOptions = {};

    // User/Admin access check
    if (userId) {
        query.userId = userId;
    } else {        
        if (!adminId) sendFailResponse("Access denied");
        const admin = await Admin.findById(adminId);
        if (!admin) sendFailResponse("Access denied");
    }

    // Search (by transactionId, bank userName, or user email)
    if (search) {
        query.$or = [
            { transactionId: { $regex: search, $options: "i" } },
            { "bankDetails.userName": { $regex: search, $options: "i" } }
        ];
    }

    // Filters
    if (filters.status) {
        query.status = filters.status;
    }
    if (filters.paymentMethod) {
        query.paymentMethod = filters.paymentMethod;
    }
    if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {};
        if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
    }
    if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
        query.amount = {};
        if (filters.minAmount !== undefined) query.amount.$gte = Number(filters.minAmount);
        if (filters.maxAmount !== undefined) query.amount.$lte = Number(filters.maxAmount);
    }

    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

    const transactions = await Transactions.find(query)
        .select(
            "-bankDetails.accountNumber -bankDetails.ifscCode -bankDetails.accountIv -bankDetails.ifscIv"
        )
        .populate({ path: "user", select: "name email" })
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean();

    const totalItems = await Transactions.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    return {
        transactions: attachId(transactions),
        currentPage: page,
        limit,
        totalPages,
        totalItems,
        isNext: page < totalPages,
        isPrevious: page > 1,
        isData: transactions?.length > 0
    };
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
    let withdrawNotification = APP_NOTIFICATIONS.withdraw

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

    const transaction = await Transactions.create({
        amount,
        userId,
        bankDetails,
        paymentMethod: PAYMENT_METHODS.DIRECT_TRANSFER
    })

    let userRemainingPoints = user.totalPoints - Math.ceil((amount / coinConfig.coinValue))
    user.totalPoints = userRemainingPoints
    await user.save()
    if (user?.fcmTokens?.length && user?.enableNotification) {
        await sendFcmNotifications(user.fcmTokens,
            withdrawNotification.initiated.title,
            formatNotification(withdrawNotification.initiated.body,
                { amount: amount })
        )
    }
    return {
        message: "Withdraw request created",
        data: {
            withdrawRequested: true,
            transactionId: transaction?._id,
            transferringTo: user.bankDetails?.userName,
            createdAt: transaction?.createdAt
        }
    }
}

// ----------------------
// Update Transaction 
// ----------------------
async function updateTransaction(data, transactionId) {
    const { status, userId } = data
    let withdrawNotification = APP_NOTIFICATIONS.withdraw
    let notificationTitle = ''
    let notificationBody = ''
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
        notificationTitle = withdrawNotification.cancelled.title
        notificationBody = withdrawNotification.cancelled.body
    } else if (status === PAYMENT_STATUS.FAILED) {

        if (!data?.failureReason || data?.failureReason?.length < 5)
            sendFailResponse('Add valid reason for failure')

        transaction.status = PAYMENT_STATUS.FAILED
        transaction.failureReason = data?.failureReason
        notificationTitle = withdrawNotification.failed.title
        notificationBody = withdrawNotification.failed.body
    } else if (status === PAYMENT_STATUS.PAID) {

        if (!data?.transactionId) sendFailResponse('Add transaction id')

        transaction.status = PAYMENT_STATUS.PAID
        transaction.transactionId = data?.transactionId
        transaction.paidAt = new Date()
        user.totalWithdraw = (user.totalWithdraw + transaction.amount)
        notificationTitle = withdrawNotification.success.title
        notificationBody = formatNotification(withdrawNotification.success.body, { amount: transaction.amount })
    }
    await transaction.save()
    await user.save()
    if (user?.fcmTokens?.length && user?.enableNotification) {
        await sendFcmNotifications(user.fcmTokens, notificationTitle, notificationBody)
    }
    return {
        message: 'Transaction status updated',
        data: { transactionStatusUpdated: true }
    }
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
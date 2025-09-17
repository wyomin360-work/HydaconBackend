const { default: mongoose } = require("mongoose");
const { PAYMENT_STATUS, PAYMENT_METHODS } = require("../constants/transactions");

const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Types.ObjectId, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: {
        type: String,
        required: true,
        enum: Object.values(PAYMENT_STATUS),
        default: PAYMENT_STATUS.INITIATED,
        index: true
    },
    paymentMethod: {
        type: String,
        required: true,
        enum: Object.values(PAYMENT_METHODS)
    },
    paymentGateway: { type: String },
    transactionId: { type: String },
    failureReason: { type: String },
    cancellationReason: { type: String },
    paidAt: { type: Date, required: false },
    bankDetails: {
        accountNumber: { type: String, required: true },
        userName: { type: String, required: true },
        ifscCode: { type: String, required: true },
        bankName: { type: String, required: true },
        branchName: { type: String, required: true },
        accountIv: { type: String, required: true },
        ifscIv: { type: String, required: true },
    },
}, { timestamps: true })

// Virtual
transactionSchema.virtual('user', {
    ref: 'User',
    localField: 'userId',
    foreignField: '_id',
    justOne: true
});


const Transactions = mongoose.model('Transactions', transactionSchema)

module.exports = Transactions


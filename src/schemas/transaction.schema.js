const { default: mongoose } = require("mongoose");
const { PAYMENT_STATUS, PAYMENT_METHODS } = require("../constants/transactions");



const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Types.ObjectId, required: true },
    rewardId: { type: mongoose.Types.ObjectId, required: true },
    productId: { type: mongoose.Types.ObjectId, required: true },
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
    paidAt: { type: Date, required: true }
}, { timestamps: true })

// Virtual

transactionSchema.virtual('reward', {
  ref: 'Reward',
  localField: 'rewardId',
  foreignField: '_id',
  justOne: true
});


const Transactions = mongoose.model('Transactions', transactionSchema)

module.exports = Transactions


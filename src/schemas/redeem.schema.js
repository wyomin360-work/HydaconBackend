const { default: mongoose } = require("mongoose");
const { REDEEM_STATUS } = require("../constants/redeem");

const redeemSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    rewardId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Reward',
        required: true
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    rewardPoints: { type: Number, required: true },
    rewardUidCode: { type: String, required: true },
    status: {
        type: String,
        required: true,
        enum: Object.values(REDEEM_STATUS),
    },
    cardBg:{ type: String }
}, { timestamps: true })

redeemSchema.virtual('reward', {
    ref: 'Reward',
    localField: 'rewardId',
    foreignField: '_id',
    justOne: true
});

redeemSchema.virtual('product', {
    ref: 'Product',
    localField: 'productId',
    foreignField: '_id',
    justOne: true
});

redeemSchema.virtual('user', {
    ref: 'User',
    localField: 'userId',
    foreignField: '_id',
    justOne: true
});

const Redeem = mongoose.model('Redeem', redeemSchema)

module.exports = Redeem
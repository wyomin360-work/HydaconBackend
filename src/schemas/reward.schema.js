const { default: mongoose } = require("mongoose");

const rewardSchema = new mongoose.Schema({
    productId: { type: mongoose.Types.ObjectId, required: true },
    uidCode: { type: String, required: true },
    redeemedBy: { type: mongoose.Types.ObjectId, required: false },
    point: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    redeemedAt: { type: Date },
    isRedeemed: { type: Boolean, default: false },
    active:{ type: Boolean, default: true }
})

rewardSchema.virtual('product', {
    ref: 'Product',
    localField: 'productId',
    foreignField: '_id',
    justOne: true
});

const Reward = mongoose.model('Reward', rewardSchema)
module.exports = Reward
const { REDEEM_STATUS } = require('../../constants/redeem')
const Product = require('../../schemas/product.schema')
const Redeem = require('../../schemas/redeem.schema')
const Reward = require('../../schemas/reward.schema')
const User = require('../../schemas/user.schema')
const { sendFailResponse } = require('../../utils/responseHandlers')

async function listRedeems(data) {
    const { page = 1, limit = 20 } = data
    const skip = (page - 1) * limit
    let query = {}

    if (data?.search) {
        query.$or = [
            { userId: { $regex: data.search, $options: 'i' } },
            { productId: { $regex: data.search, $options: 'i' } },
            { rewardId: { $regex: data.search, $options: 'i' } },
            { rewardUidCode: { $regex: data.search, $options: 'i' } }
        ];
    }

    const redeems = await Redeem.find(query)
        .populate('reward')
        .skip(skip)
        .limit(limit)
        .lean()
    const totalDocuments = await Redeem.countDocuments()
    return {
        data: {
            redeems,
            page,
            limit,
            totalPages: Math.ceil(totalDocuments / limit),
            total: totalDocuments
        }
    }
}

async function redeemDetails(redeemId) {
    const redeem = await Redeem.findById(redeemId)
        .populate('product')
        .populate('reward')
        .populate('user')
        .lean()
    if (!redeem) sendFailResponse('The redeem details not found')
    return { data: redeem }
}

async function createRedeem(redeemData) {
    const { userId, productId, rewardId, rewardUidCode } = redeemData
    const now = new Date()

    const user = await User.findById(userId)
    if (!user) sendFailResponse('unable to find user')

    const product = await Product.findById(productId)
    if (!product) sendFailResponse('product not found')

    const reward = await Reward.findOne({ _id: rewardId, uidCode: rewardUidCode })
    if (!reward) sendFailResponse('reward not found')
    if (!reward.active) sendFailResponse('reward is inactive')
    if (new Date(reward.expiresAt) < now) sendFailResponse('reward is expired')
    if (reward.isRedeemed) sendFailResponse('reward already redeemed')

    const newRedeem = await Redeem.create({
        userId,
        productId,
        rewardId,
        rewardUidCode,
        rewardPoints: reward?.point,
        status: REDEEM_STATUS.SUCCESS
    })
    if (!newRedeem) sendFailResponse('reward redeem failed')
        
    // update reward status
    reward.isRedeemed = true
    reward.redeemedAt = new Date()
    reward.redeemedBy = userId
    reward.active = false

    // update user
    user.totalPoints += reward?.point

    // save
    await user.save()
    await reward.save()
    return { message: 'redeem successful', data: { redeemSuccessful: true } }
}

async function deleteRedeem(redeemId) {
    await Redeem.findByIdAndDelete(redeemId)
    return { message: 'redeem deleted', data: { redeemDeleted: true } }
}

module.exports = {
    listRedeems,
    redeemDetails,
    createRedeem,
    deleteRedeem
}
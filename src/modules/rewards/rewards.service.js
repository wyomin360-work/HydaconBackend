const Product = require('../../schemas/product.schema')
const Reward = require('../../schemas/reward.schema')
const { randomHex } = require('../../utils/heplers')
const { sendFailResponse } = require('../../utils/responseHandlers')

async function listRewards(data) {
    const { page = 1, limit = 20 } = data

    const skip = (page - 1) * limit
    let query = {}
    if (data?.productId) {
        query.productId = data?.productId
    }

    const rewards = await Reward.find(query).skip(skip).limit(limit).lean()
    const totalDocuments = await Reward.countDocuments()
    return {
        data: {
            rewards,
            page,
            limit,
            totalPages: Math.ceil(totalDocuments / limit),
            total: totalDocuments
        }
    }
}

async function rewardDetails(rewardId) {
    const reward = await Reward.findById(rewardId).populate('product').lean()
    if (!reward) sendFailResponse('reward not found')
    return { data: reward }
}

async function createRewards(rewardData) {
    const { expiresAt, productId, count } = rewardData

    const product = await Product.findById(productId).lean()
    if (!product) sendFailResponse('product not found')

    const generateComplexRewardUID = () => {
        return 'rwd-' + Date.now().toString(36) + '-' + randomHex() + '-' + randomHex() + '-' + randomHex();
    }
    const structuredRewards = []


    for (let i = 0; i < count; i++) {
        const rewardUID = generateComplexRewardUID()
        const reward = {
            productId,
            expiresAt,
            uidCode: rewardUID,
            point: product.rewardPoints
        }
        structuredRewards.push(reward)
    }

    if (!structuredRewards.length) sendFailResponse('failed to generate rewards')
    await Reward.insertMany(structuredRewards)
    return { message: `Created ${count} rewards`, data: { rewardsAdded: true } }
}

async function updateReward(rewardData,rewardId) {
    const { expiresAt, rewardPoints, active} = rewardData
    await Reward.findByIdAndUpdate(rewardId, {
        expiresAt,
        point: rewardPoints,
        active: active
    })
    return { message: 'reward updated', data: { rewardsUpdated: true } }
}

async function deleteReward(rewardId) {
    await Reward.findByIdAndDelete(rewardId)
    return { message: "reward deleted", data: { rewardDeleted: true } }
}

module.exports = {
    listRewards,
    rewardDetails,
    createRewards,
    updateReward,
    deleteReward
}
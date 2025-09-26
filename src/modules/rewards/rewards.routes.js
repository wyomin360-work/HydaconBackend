const express = require('express')
const rewardsPath = require('./rewards.path')
const { handleError } = require('../../utils/heplers')
const rewardsController = require('./rewards.controller')
const validateRequest = require('../../middlewares/validator')
const { listRewardRequestType, createRewardRequestType, updateRewardRequestType } = require('../../validations/rewards.validations')

const router = express.Router()

router.post(
    rewardsPath.list,
    validateRequest(listRewardRequestType),
    handleError(rewardsController.listRewards)
)
router.get(
    rewardsPath.details,
    handleError(rewardsController.rewardDetails)
)
router.post(
    rewardsPath.create,
    validateRequest(createRewardRequestType),
    handleError(rewardsController.createRewards)
)
router.patch(
    rewardsPath.update,
    validateRequest(updateRewardRequestType),
    handleError(rewardsController.updateReward)
)
router.delete(
    rewardsPath.delete,
    handleError(rewardsController.deleteReward)
)

router.delete(
    rewardsPath.deleteAll,
    handleError(rewardsController.deleteAllReward)
)

module.exports = router
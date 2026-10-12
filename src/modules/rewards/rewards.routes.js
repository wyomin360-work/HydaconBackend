const express = require("express");
const rewardsPath = require("./rewards.path");
const { handleError } = require("../../utils/heplers");
const rewardsController = require("./rewards.controller");
const validateRequest = require("../../middlewares/validator");
const {
  listRewardRequestType,
  createRewardRequestType,
  updateRewardRequestType,
  bulkUpdateRewardRequestType,
  batchUpdateRewardRequestType,
  listGroupedRewardsRequestType,
  listRewardBatchesRequestType,
  updateRewardBatchRequestType,
} = require("../../validations/rewards.validations");

const router = express.Router();

router.post(
  rewardsPath.list,
  validateRequest(listRewardRequestType),
  handleError(rewardsController.listRewards),
);
router.post(
  rewardsPath.listGrouped,
  validateRequest(listGroupedRewardsRequestType),
  handleError(rewardsController.listRewardsGroupedByDate),
);
router.post(
  rewardsPath.batches,
  validateRequest(listRewardBatchesRequestType),
  handleError(rewardsController.listRewardBatches),
);
router.post(
  rewardsPath.batchDownload,
  handleError(rewardsController.createRewardBatchDownload),
);
router.get(
  rewardsPath.batchDownloadStatus,
  handleError(rewardsController.rewardBatchDownloadStatus),
);
router.patch(
  rewardsPath.batchDownloadCancel,
  handleError(rewardsController.cancelRewardBatchDownload),
);
router.get(
  rewardsPath.batchDetails,
  handleError(rewardsController.rewardBatchDetails),
);
router.post(
  rewardsPath.batchRewards,
  validateRequest(listRewardRequestType),
  handleError(rewardsController.listRewardsByBatch),
);
router.patch(
  rewardsPath.batchDeactivate,
  handleError(rewardsController.deactivateRewardBatch),
);
router.patch(
  rewardsPath.batchUpdateById,
  validateRequest(updateRewardBatchRequestType),
  handleError(rewardsController.updateRewardBatch),
);
router.delete(
  rewardsPath.batchDelete,
  handleError(rewardsController.deleteRewardBatch),
);
router.get(rewardsPath.details, handleError(rewardsController.rewardDetails));
router.post(
  rewardsPath.create,
  validateRequest(createRewardRequestType),
  handleError(rewardsController.createRewards),
);
router.patch(
  rewardsPath.update,
  validateRequest(updateRewardRequestType),
  handleError(rewardsController.updateReward),
);
router.patch(
  rewardsPath.bulkUpdate,
  validateRequest(bulkUpdateRewardRequestType),
  handleError(rewardsController.bulkUpdateRewards),
);
router.patch(
  rewardsPath.batchUpdate,
  validateRequest(batchUpdateRewardRequestType),
  handleError(rewardsController.batchUpdateRewards),
);
router.delete(rewardsPath.delete, handleError(rewardsController.deleteReward));

router.delete(
  rewardsPath.deleteAll,
  handleError(rewardsController.deleteAllReward),
);

module.exports = router;

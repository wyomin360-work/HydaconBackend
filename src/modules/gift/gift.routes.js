const express = require("express");
const giftPaths = require("./gift.paths");
const giftController = require("./gift.controller");
const { handleError } = require("../../utils/heplers");
const validateRequest = require("../../middlewares/validator");
const {
  giftCreateRequestType,
  giftUpdateRequestType,
  categoryCreateRequestType,
  categoryUpdateRequestType,
} = require("../../validations/gift.validations");
const { paginationType } = require("../../validations/global.validations");
const verification = require("../../middlewares/jwtVerification");

const router = express.Router();

// Categories (Public)
router.post(
  giftPaths.publicCategoryList,
  validateRequest(paginationType),
  handleError(giftController.listCategories),
);

// Categories (Admin)
router.post(
  giftPaths.categoryList,
  verification.verifyAdmin,
  validateRequest(paginationType),
  handleError(giftController.listCategories),
);
router.post(
  giftPaths.categoryCreate,
  verification.verifyAdmin,
  validateRequest(categoryCreateRequestType),
  handleError(giftController.createCategory),
);
router.patch(
  giftPaths.categoryUpdate,
  verification.verifyAdmin,
  validateRequest(categoryUpdateRequestType),
  handleError(giftController.updateCategory),
);
router.delete(
  giftPaths.categoryDelete,
  verification.verifyAdmin,
  handleError(giftController.deleteCategory),
);

// Gifts (Admin)
router.post(
  giftPaths.adminList,
  verification.verifyAdmin,
  validateRequest(paginationType),
  handleError(giftController.adminListGifts),
);
router.get(
  giftPaths.adminDetails,
  verification.verifyAdmin,
  handleError(giftController.getGiftDetails),
);
router.post(
  giftPaths.adminCreate,
  verification.verifyAdmin,
  validateRequest(giftCreateRequestType),
  handleError(giftController.createGift),
);
router.patch(
  giftPaths.adminUpdate,
  verification.verifyAdmin,
  validateRequest(giftUpdateRequestType),
  handleError(giftController.updateGift),
);
router.delete(
  giftPaths.adminDelete,
  verification.verifyAdmin,
  handleError(giftController.deleteGift),
);

// Gifts (User)
router.post(
  giftPaths.userCategoryList,
  verification.verifyUser,
  validateRequest(paginationType),
  handleError(giftController.listCategories),
);
router.post(
  giftPaths.userList,
  verification.verifyUser,
  validateRequest(paginationType),
  handleError(giftController.userListGifts),
);
router.get(
  giftPaths.userDetails,
  verification.verifyUser,
  handleError(giftController.getGiftDetails),
);
router.get(
  giftPaths.userEligibility,
  verification.verifyUser,
  handleError(giftController.getGiftEligibility),
);
router.get(
  giftPaths.userRedemptionDetails,
  verification.verifyUser,
  handleError(giftController.getUserRedemptionDetails),
);

// Redemptions
router.post(
  giftPaths.redeemGift,
  verification.verifyUser,
  handleError(giftController.redeemGift),
);
router.post(
  giftPaths.userRedemptions,
  verification.verifyUser,
  validateRequest(paginationType),
  handleError(giftController.userRedemptions),
);
router.post(
  giftPaths.adminRedemptionList,
  verification.verifyAdmin,
  validateRequest(paginationType),
  handleError(giftController.adminRedemptionList),
);
router.patch(
  giftPaths.adminUpdateRedemption,
  verification.verifyAdmin,
  handleError(giftController.adminUpdateRedemption),
);
router.get(
  giftPaths.adminRedemptionDetails,
  verification.verifyAdmin,
  handleError(giftController.getAdminRedemptionDetails),
);

// Analytics
router.get(
  giftPaths.adminAnalytics,
  verification.verifyAdmin,
  handleError(giftController.getAnalytics),
);
module.exports = router;

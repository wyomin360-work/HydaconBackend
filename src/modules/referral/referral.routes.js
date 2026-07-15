const express = require("express");
const { handleError } = require("../../utils/heplers");
const controller = require("./referral.controller");
const verification = require("../../middlewares/jwtVerification");

const router = express.Router();

/**
 * GET /referrals/my-referrals
 * Combined stats + referral list (used by mobile dashboard).
 */
router.get(
  "/my-referrals",
  verification.verifyUser,
  handleError(controller.getMyReferrals),
);

/**
 * GET /referrals/stats
 * Referral stats only.
 */
router.get(
  "/stats",
  verification.verifyUser,
  handleError(controller.getMobileReferralStats),
);

/**
 * GET /referrals/list
 * Flat referral list only.
 */
router.get(
  "/list",
  verification.verifyUser,
  handleError(controller.getMobileReferralList),
);

/**
 * POST /referrals/reminder
 * Acknowledgement endpoint — actual reminder delivery is client-side.
 */
router.post(
  "/reminder",
  verification.verifyUser,
  handleError(controller.sendMobileReferralReminder),
);

/**
 * POST /referrals/milestone
 */
router.post(
  "/milestone",
  verification.verifyUser,
  handleError(controller.completeMilestone),
);

module.exports = router;

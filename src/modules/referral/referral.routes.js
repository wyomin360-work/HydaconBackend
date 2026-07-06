const express = require("express");
const { handleError } = require("../../utils/heplers");
const controller = require("./referral.controller");
const referralPaths = require("./referral.paths");
const verification = require("../../middlewares/jwtVerification");
const validateRequest = require("../../middlewares/validator");
const { sendReferralRequestType } = require("../../validations/referral.validations");

const router = express.Router();

// ─────────────────────────────────────────────
// User endpoints (require authenticated user)
// ─────────────────────────────────────────────

/**
 * GET /referral/dashboard
 * Returns the referral dashboard (stats + referral code + paginated list).
 * NOTE: Must be registered before /:id to avoid path collision.
 */
router.get(
  referralPaths.dashboard,
  verification.verifyUser,
  handleError(controller.getReferralDashboard),
);

/**
 * GET /referral/my-referrals
 * Returns all referrals sent by the authenticated user (paginated).
 * NOTE: Must be registered before /:id to avoid path collision.
 */
router.get(
  referralPaths.myReferrals,
  verification.verifyUser,
  handleError(controller.getUserReferrals),
);

/**
 * POST /referral/send
 * Sends a referral invitation to a phone number.
 */
router.post(
  referralPaths.send,
  verification.verifyUser,
  validateRequest(sendReferralRequestType),
  handleError(controller.sendReferral),
);

// ─────────────────────────────────────────────
// Plural endpoints to support mobile app client
// ─────────────────────────────────────────────

router.get(
  "/stats",
  verification.verifyUser,
  handleError(controller.getMobileReferralStats),
);

router.get(
  "/list",
  verification.verifyUser,
  handleError(controller.getMobileReferralList),
);

router.post(
  "/invite",
  verification.verifyUser,
  validateRequest(sendReferralRequestType),
  handleError(controller.sendReferral),
);

router.post(
  "/reminder",
  verification.verifyUser,
  handleError(controller.sendMobileReferralReminder),
);

/**
 * GET /referral/:id
 * Returns a single referral by its ID.
 */
router.get(
  referralPaths.detail,
  verification.verifyUser,
  handleError(controller.getReferralById),
);

/**
 * PATCH /referral/:id/reward
 * Marks a referral as rewarded.
 * (Can be called by user or triggered programmatically from scan logic.)
 */
router.patch(
  referralPaths.reward,
  verification.verifyUser,
  handleError(controller.rewardReferral),
);

/**
 * PATCH /referral/:id/first-scan-reminder
 * Records that a first-scan reminder was sent for a joined referral.
 */
router.patch(
  referralPaths.firstScanReminder,
  verification.verifyUser,
  handleError(controller.sendFirstScanReminder),
);

/**
 * DELETE /referral/:id
 * Deletes a pending referral (only the inviter can delete their own).
 */
router.delete(
  referralPaths.delete,
  verification.verifyUser,
  handleError(controller.deleteReferral),
);

module.exports = router;

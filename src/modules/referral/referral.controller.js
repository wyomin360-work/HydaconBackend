const { sendResponse } = require("../../utils/responseHandlers");
const referralService = require("./referral.service");

/**
 * GET /referrals/stats
 */
exports.getMobileReferralStats = async (req, res) => {
  const response = await referralService.getMobileReferralStats(req.userId);
  return sendResponse(res, response);
};

/**
 * GET /referrals/list
 */
exports.getMobileReferralList = async (req, res) => {
  const response = await referralService.getMobileReferralList(req.userId);
  return sendResponse(res, response);
};

/**
 * GET /referrals/my-referrals
 * Returns combined stats + list in a single response.
 */
exports.getMyReferrals = async (req, res) => {
  const response = await referralService.getMyReferrals(req.userId);
  return sendResponse(res, response);
};

/**
 * POST /referrals/reminder
 * Reminder is delivered client-side; this is an acknowledgement endpoint.
 */
exports.sendMobileReferralReminder = async (req, res) => {
  const response = await referralService.sendReminderByUserId(req.body.referredUserId);
  return sendResponse(res, response);
};

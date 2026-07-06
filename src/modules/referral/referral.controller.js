const { sendResponse, sendFailResponse } = require("../../utils/responseHandlers");
const referralService = require("./referral.service");

/**
 * POST /referral/send
 * Sends a referral invitation to a phone number.
 * Requires authenticated user (verifyUser middleware).
 */
exports.sendReferral = async (req, res) => {
  const inviterId = req.userId;
  const { phoneNumber } = req.body;
  const response = await referralService.sendReferral(inviterId, phoneNumber);
  return sendResponse(res, response, 201);
};

/**
 * GET /referral/:id
 * Returns a single referral by its ID.
 * Requires authenticated user.
 */
exports.getReferralById = async (req, res) => {
  const referralId = req.params.id;
  const response = await referralService.getReferralById(referralId);
  return sendResponse(res, response);
};

/**
 * GET /referral/my-referrals
 * Returns all referrals sent by the authenticated user (paginated).
 */
exports.getUserReferrals = async (req, res) => {
  const inviterId = req.userId;
  const options = {
    page: req.query.page,
    limit: req.query.limit,
    status: req.query.status,
  };
  const response = await referralService.getUserReferrals(inviterId, options);
  return sendResponse(res, response);
};

/**
 * GET /referral/dashboard
 * Returns the referral dashboard summary (stats + list + referral code).
 * Requires authenticated user.
 */
exports.getReferralDashboard = async (req, res) => {
  const inviterId = req.userId;
  const options = {
    page: req.query.page,
    limit: req.query.limit,
    status: req.query.status,
  };
  const response = await referralService.getReferralDashboard(inviterId, options);
  return sendResponse(res, response);
};

/**
 * PATCH /referral/:id/reward
 * Marks a joined referral as rewarded.
 * Requires authenticated user (typically triggered by a system/admin event).
 */
exports.rewardReferral = async (req, res) => {
  const referralId = req.params.id;
  const response = await referralService.rewardReferral(referralId);
  return sendResponse(res, response);
};

/**
 * PATCH /referral/:id/first-scan-reminder
 * Records that a first-scan reminder has been sent for a joined referral.
 */
exports.sendFirstScanReminder = async (req, res) => {
  const referralId = req.params.id;
  const response = await referralService.sendFirstScanReminder(referralId);
  return sendResponse(res, response);
};

/**
 * DELETE /referral/:id
 * Deletes a pending referral. Only the inviter can delete their own referral.
 */
exports.deleteReferral = async (req, res) => {
  const referralId = req.params.id;
  const requesterId = req.userId;
  const response = await referralService.deleteReferral(referralId, requesterId);
  return sendResponse(res, response);
};

/**
 * GET /referrals/stats (Mobile Client)
 * Returns the simplified stats schema for the mobile dashboard.
 */
exports.getMobileReferralStats = async (req, res) => {
  const inviterId = req.userId;
  const User = require("../../schemas/user.schema");
  const Referral = require("../../schemas/referral.schema");
  const referralRepository = require("./referral.repository");

  const [stats, user, referrals] = await Promise.all([
    referralRepository.getReferralStats(inviterId),
    User.findById(inviterId).select("referralCode").lean(),
    Referral.find({ inviterId }).lean(),
  ]);

  const totalEarnings = referrals.reduce((sum, r) => {
    let pts = 0;
    if (r.invitationStatus === "scanned" || r.invitationStatus === "rewarded") {
      pts += 150;
    } else if (r.invitationStatus === "kyc_done") {
      pts += 50;
    }
    return sum + pts;
  }, 0);

  const responseData = {
    totalReferrals: stats.total || 0,
    totalPoints: totalEarnings,
    totalEarnings: totalEarnings,
    referralCode: user?.referralCode || "",
    referralLink: `https://hydacon.com/r/${user?.referralCode || ""}`,
  };

  return sendResponse(res, responseData);
};

/**
 * GET /referrals/list (Mobile Client)
 * Returns a flat array of ReferralEntry items for the mobile client.
 */
exports.getMobileReferralList = async (req, res) => {
  const inviterId = req.userId;
  const Referral = require("../../schemas/referral.schema");
  const moment = require("moment");

  const referrals = await Referral.find({ inviterId })
    .populate("inviteeId", "name email phone totalScans")
    .sort({ createdAt: -1 })
    .lean();

  const list = referrals.map((r) => {
    let points = 0;
    if (r.invitationStatus === "scanned" || r.invitationStatus === "rewarded") {
      points = 150;
    } else if (r.invitationStatus === "kyc_done") {
      points = 50;
    }

    return {
      id: r._id.toString(),
      referredUserId: r.inviteeId?._id?.toString() || null,
      name: r.inviteeId?.name || r.phoneNumber,
      joinedDate: r.joinedAt ? moment(r.joinedAt).format("D MMM YYYY") : "Pending",
      status: r.invitationStatus,
      pointsEarned: points,
      scans: r.inviteeId?.totalScans || (r.invitationStatus === "scanned" ? 1 : 0),
      phone: r.inviteeId?.phone || r.phoneNumber,
    };
  });

  return sendResponse(res, list);
};

/**
 * POST /referrals/reminder (Mobile Client)
 * Sends a reminder notification using the invitee's referredUserId.
 */
exports.sendMobileReferralReminder = async (req, res) => {
  const { referredUserId } = req.body;
  const Referral = require("../../schemas/referral.schema");

  const referral = await Referral.findOne({ inviteeId: referredUserId });
  if (!referral) sendFailResponse("Referral not found.", 404);

  const response = await referralService.sendFirstScanReminder(referral._id);
  return sendResponse(res, response);
};

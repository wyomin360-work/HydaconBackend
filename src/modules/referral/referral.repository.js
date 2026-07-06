const mongoose = require("mongoose");
const Referral = require("../../schemas/referral.schema");
const { REFERRAL_STATUS } = require("../../constants/referral");

// ─────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────

/**
 * Creates a new referral record.
 * @param {object} data - { inviterId, phoneNumber }
 */
async function createReferral(data) {
  return Referral.create(data);
}

// ─────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────

/**
 * Finds a referral by its _id.
 */
async function findById(referralId) {
  return Referral.findById(referralId)
    .populate("inviterId", "name email phone referralCode")
    .populate("inviteeId", "name email phone")
    .lean();
}

/**
 * Finds all referrals sent by a specific inviter.
 * @param {string} inviterId
 * @param {object} [options] - { page, limit, status }
 */
async function findByInviter(inviterId, options = {}) {
  const page = Number(options.page || 1);
  const limit = Number(options.limit || 20);
  const skip = (page - 1) * limit;

  const filter = { inviterId };
  if (options.status) filter.invitationStatus = options.status;

  const [referrals, total] = await Promise.all([
    Referral.find(filter)
      .populate("inviteeId", "name email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Referral.countDocuments(filter),
  ]);

  return {
    referrals,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Finds all referrals where a user is the invitee.
 */
async function findByInvitee(inviteeId) {
  return Referral.findOne({ inviteeId })
    .populate("inviterId", "name email phone referralCode")
    .lean();
}

/**
 * Finds a referral by inviter + phone number.
 */
async function findByPhoneNumber(inviterId, phoneNumber) {
  return Referral.findOne({ inviterId, phoneNumber }).lean();
}

/**
 * Finds a pending referral by phone number (across all inviters).
 * Used during user registration to match the new user to their referrer.
 */
async function findPendingReferral(phoneNumber) {
  return Referral.findOne({
    phoneNumber,
    invitationStatus: REFERRAL_STATUS.PENDING,
  }).lean();
}

// ─────────────────────────────────────────────
// Update
// ─────────────────────────────────────────────

/**
 * Generic update for a referral document.
 */
async function updateReferral(referralId, updateData) {
  return Referral.findByIdAndUpdate(referralId, updateData, {
    new: true,
    runValidators: true,
  }).lean();
}

/**
 * Marks a referral as joined and links the invitee user.
 */
async function markJoined(referralId, inviteeId) {
  return Referral.findByIdAndUpdate(
    referralId,
    {
      invitationStatus: REFERRAL_STATUS.JOINED,
      inviteeId,
      joinedAt: new Date(),
    },
    { new: true },
  ).lean();
}

async function markKycDone(inviteeId) {
  return Referral.findOneAndUpdate(
    { inviteeId, invitationStatus: REFERRAL_STATUS.JOINED },
    { invitationStatus: REFERRAL_STATUS.KYC_DONE },
    { new: true },
  ).lean();
}

async function markScanned(inviteeId) {
  return Referral.findOneAndUpdate(
    {
      inviteeId,
      invitationStatus: { $in: [REFERRAL_STATUS.JOINED, REFERRAL_STATUS.KYC_DONE] },
    },
    {
      invitationStatus: REFERRAL_STATUS.SCANNED,
      rewardedAt: new Date(),
    },
    { new: true },
  ).lean();
}

/**
 * Marks a referral as rewarded.
 */
async function markRewarded(referralId) {
  return Referral.findByIdAndUpdate(
    referralId,
    {
      invitationStatus: REFERRAL_STATUS.SCANNED,
      rewardedAt: new Date(),
    },
    { new: true },
  ).lean();
}

/**
 * Marks firstScanReminderSent = 1 for a referral.
 */
async function markFirstScanReminderSent(referralId) {
  return Referral.findByIdAndUpdate(
    referralId,
    { firstScanReminderSent: 1 },
    { new: true },
  ).lean();
}

// ─────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────

/**
 * Soft-deletes by removing the referral document permanently.
 */
async function deleteReferral(referralId) {
  return Referral.findByIdAndDelete(referralId);
}

// ─────────────────────────────────────────────
// Aggregations
// ─────────────────────────────────────────────

/**
 * Returns aggregated referral statistics for an inviter.
 * @param {string} inviterId
 */
async function getReferralStats(inviterId) {
  const result = await Referral.aggregate([
    { $match: { inviterId: new mongoose.Types.ObjectId(inviterId.toString()) } },
    {
      $group: {
        _id: "$invitationStatus",
        count: { $sum: 1 },
      },
    },
  ]);

  const stats = {
    total: 0,
    started: 0,
    joined: 0,
    kyc_done: 0,
    scanned: 0,
  };

  for (const row of result) {
    stats[row._id] = row.count;
  }

  // The actual referral count only includes users who registered/logged in
  stats.total = (stats.joined || 0) + (stats.kyc_done || 0) + (stats.scanned || 0);

  return stats;
}

module.exports = {
  createReferral,
  findById,
  findByInviter,
  findByInvitee,
  findByPhoneNumber,
  findPendingReferral,
  updateReferral,
  markJoined,
  markRewarded,
  markFirstScanReminderSent,
  deleteReferral,
  getReferralStats,
  markKycDone,
  markScanned,
};

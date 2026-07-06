const User = require("../../schemas/user.schema");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { buildPhoneLookupVariants } = require("../../utils/heplers");
const { REFERRAL_STATUS } = require("../../constants/referral");
const referralRepository = require("./referral.repository");

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Normalizes a phone number to a canonical stored form.
 * Follows the same convention used in user.service.js (buildPhoneLookupVariants).
 */
function normalizePhone(phoneNumber) {
  return String(phoneNumber || "").trim();
}

/**
 * Validates that a phone number is plausibly formatted.
 * Accepts 10–15 digit numbers, with optional leading +.
 */
function isValidPhone(phoneNumber) {
  return /^\+?[0-9]{10,15}$/.test(normalizePhone(phoneNumber));
}

// ─────────────────────────────────────────────
// sendReferral
// ─────────────────────────────────────────────

/**
 * Sends a referral invitation from an inviter to a phone number.
 *
 * Business rules:
 * - Inviter must exist.
 * - Phone number must be valid.
 * - Duplicate invitation (same inviterId + phoneNumber) is prevented by the
 *   unique compound index — we give a clean error here before hitting the DB.
 *
 * The backend only stores the referral; SMS/notification delivery is separate.
 *
 * @param {string} inviterId  - ObjectId of the authenticated user sending the invite.
 * @param {string} phoneNumber - Target phone number.
 */
async function sendReferral(inviterId, phoneNumber) {
  // 1. Validate phone number format
  const normalizedPhone = normalizePhone(phoneNumber);
  if (!isValidPhone(normalizedPhone)) {
    sendFailResponse("Invalid phone number format. Provide a 10–15 digit number.");
  }

  // 2. Confirm the inviter exists
  const inviter = await User.findById(inviterId).lean();
  if (!inviter) sendFailResponse("Inviter not found.", 404);

  // 3. Prevent self-referral
  if (inviter.phone) {
    const variants = buildPhoneLookupVariants(inviter.phone);
    if (variants.some((v) => buildPhoneLookupVariants(normalizedPhone).includes(v))) {
      sendFailResponse("You cannot refer your own phone number.");
    }
  }

  // 4. Prevent duplicate invitation (same inviter + phone)
  const existing = await referralRepository.findByPhoneNumber(inviterId, normalizedPhone);
  if (existing) {
    sendFailResponse(
      `You have already sent an invitation to ${normalizedPhone}. Current status: ${existing.invitationStatus}.`,
    );
  }

  // 5. Create the referral (status = pending)
  const referral = await referralRepository.createReferral({
    inviterId,
    phoneNumber: normalizedPhone,
  });

  return {
    message: "Referral invitation recorded successfully.",
    data: { referral },
  };
}

// ─────────────────────────────────────────────
// getReferralById
// ─────────────────────────────────────────────

/**
 * Returns a single referral by its ID, populated with user data.
 */
async function getReferralById(referralId) {
  const referral = await referralRepository.findById(referralId);
  if (!referral) sendFailResponse("Referral not found.", 404);
  return { data: referral };
}

// ─────────────────────────────────────────────
// getUserReferrals
// ─────────────────────────────────────────────

/**
 * Returns all referrals sent by a user, with pagination and optional status filter.
 * @param {string} inviterId
 * @param {object} options - { page, limit, status }
 */
async function getUserReferrals(inviterId, options = {}) {
  const result = await referralRepository.findByInviter(inviterId, options);
  return result;
}

// ─────────────────────────────────────────────
// joinReferral
// ─────────────────────────────────────────────

/**
 * Called when a referred user registers/joins the platform.
 * Matches them to a pending referral by their phone number and marks it as joined.
 *
 * @param {string} inviteeId   - ObjectId of the newly registered user.
 * @param {string} phoneNumber - Phone number used at registration.
 */
async function joinReferral(inviteeId, phoneNumber) {
  const normalizedPhone = normalizePhone(phoneNumber);

  // Find pending referral for this phone
  const pendingReferral = await referralRepository.findPendingReferral(normalizedPhone);
  if (!pendingReferral) {
    // No referral exists for this phone — not an error, just no referral to join
    return null;
  }

  // Guard: if the inviteeId is the same as the inviterId (self-referral edge case)
  if (String(pendingReferral.inviterId) === String(inviteeId)) {
    return null;
  }

  const updated = await referralRepository.markJoined(pendingReferral._id, inviteeId);
  return updated;
}

// ─────────────────────────────────────────────
// rewardReferral
// ─────────────────────────────────────────────

/**
 * Marks a joined referral as rewarded (e.g., after the invitee completes a first scan).
 * Only `joined` referrals can be rewarded.
 *
 * @param {string} referralId
 */
async function rewardReferral(referralId) {
  const referral = await referralRepository.findById(referralId);
  if (!referral) sendFailResponse("Referral not found.", 404);

  if (referral.invitationStatus !== REFERRAL_STATUS.JOINED) {
    sendFailResponse(
      `Only referrals with status 'joined' can be rewarded. Current status: '${referral.invitationStatus}'.`,
    );
  }

  const rewarded = await referralRepository.markRewarded(referralId);
  return {
    message: "Referral marked as rewarded.",
    data: { referral: rewarded },
  };
}

// ─────────────────────────────────────────────
// sendFirstScanReminder
// ─────────────────────────────────────────────

/**
 * Marks that a first-scan reminder has been sent for a joined referral.
 * Prevents sending duplicate reminders.
 *
 * @param {string} referralId
 */
async function sendFirstScanReminder(referralId) {
  const referral = await referralRepository.findById(referralId);
  if (!referral) sendFailResponse("Referral not found.", 404);

  if (referral.invitationStatus !== REFERRAL_STATUS.JOINED) {
    sendFailResponse(
      "First-scan reminders can only be sent for referrals with status 'joined'.",
    );
  }

  if (referral.firstScanReminderSent === 1) {
    sendFailResponse("First-scan reminder has already been sent for this referral.");
  }

  const updated = await referralRepository.markFirstScanReminderSent(referralId);
  return {
    message: "First scan reminder marked as sent.",
    data: { referral: updated },
  };
}

// ─────────────────────────────────────────────
// deleteReferral
// ─────────────────────────────────────────────

/**
 * Deletes a referral record permanently.
 * Only pending referrals can be deleted (cannot cancel an already-joined referral).
 *
 * @param {string} referralId
 * @param {string} requesterId - The userId making the request (must be the inviter or admin flow).
 */
async function deleteReferral(referralId, requesterId) {
  const referral = await referralRepository.findById(referralId);
  if (!referral) sendFailResponse("Referral not found.", 404);

  if (String(referral.inviterId._id || referral.inviterId) !== String(requesterId)) {
    sendFailResponse("You are not authorized to delete this referral.", 403);
  }

  if (referral.invitationStatus !== REFERRAL_STATUS.PENDING) {
    sendFailResponse(
      `Only pending referrals can be deleted. Current status: '${referral.invitationStatus}'.`,
    );
  }

  await referralRepository.deleteReferral(referralId);
  return { message: "Referral deleted successfully.", data: { deleted: true } };
}

// ─────────────────────────────────────────────
// getReferralDashboard
// ─────────────────────────────────────────────

/**
 * Returns a dashboard summary for a user's referral activity:
 * - Aggregated stats (total, pending, joined, rewarded)
 * - Full paginated referral list
 * - The user's own referral code
 *
 * @param {string} inviterId
 * @param {object} options - { page, limit, status }
 */
async function getReferralDashboard(inviterId, options = {}) {
  const [stats, listResult, user] = await Promise.all([
    referralRepository.getReferralStats(inviterId),
    referralRepository.findByInviter(inviterId, options),
    User.findById(inviterId).select("referralCode name").lean(),
  ]);

  return {
    data: {
      referralCode: user?.referralCode || null,
      inviterName: user?.name || null,
      stats,
      referrals: listResult.referrals,
      pagination: listResult.pagination,
    },
  };
}

async function markKycDone(inviteeId) {
  return referralRepository.markKycDone(inviteeId);
}

async function markScanned(inviteeId) {
  return referralRepository.markScanned(inviteeId);
}

module.exports = {
  sendReferral,
  getReferralById,
  getUserReferrals,
  joinReferral,
  rewardReferral,
  sendFirstScanReminder,
  deleteReferral,
  getReferralDashboard,
  markKycDone,
  markScanned,
};

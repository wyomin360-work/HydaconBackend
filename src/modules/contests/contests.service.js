const { Contest, CONTEST_STATUS } = require("../../schemas/contest.schema");
const { ContestEntry, ENTRY_REWARD_STATUS } = require("../../schemas/contest-entry.schema");
const UserTierProgress = require("../../schemas/user-tier-progress.schema");
const User = require("../../schemas/user.schema");
const { attachId } = require("../../utils/heplers");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { sendFcmNotifications } = require("../../functions/fcm");

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveContestStatus(contest) {
  const now = new Date();
  if (now < new Date(contest.startDate)) return CONTEST_STATUS.UPCOMING;
  if (now > new Date(contest.endDate)) return CONTEST_STATUS.COMPLETED;
  return CONTEST_STATUS.ACTIVE;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

async function adminCreateContest(data, adminId) {
  const { name, description, bannerImage, startDate, endDate, region, prizes } = data;
  const contest = await Contest.create({
    name, description, bannerImage,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    region: region || null,
    prizes: prizes || [],
    createdBy: adminId,
    status: new Date(startDate) > new Date() ? CONTEST_STATUS.UPCOMING : CONTEST_STATUS.ACTIVE,
  });
  return { message: "Contest created", data: { contestId: contest._id } };
}

async function adminUpdateContest(contestId, data) {
  const contest = await Contest.findById(contestId);
  if (!contest) sendFailResponse("Contest not found", 404);
  Object.assign(contest, data);
  if (data.startDate || data.endDate) {
    contest.status = resolveContestStatus(contest);
  }
  await contest.save();
  return { message: "Contest updated", data: { updated: true } };
}

async function adminDeleteContest(contestId) {
  await Contest.findByIdAndDelete(contestId);
  return { message: "Contest deleted", data: { deleted: true } };
}

async function adminListContests(query = {}) {
  const { page = 1, limit = 20, status } = query;
  const skip = (page - 1) * limit;
  const filter = {};
  if (status) filter.status = status;
  const [contests, total] = await Promise.all([
    Contest.find(filter).sort({ startDate: -1 }).skip(skip).limit(limit).lean(),
    Contest.countDocuments(filter),
  ]);
  return {
    data: {
      contests: attachId(contests),
      page, limit, total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function adminGetContestDetails(contestId) {
  const contest = await Contest.findById(contestId).lean();
  if (!contest) sendFailResponse("Contest not found", 404);
  const entries = await ContestEntry.find({ contestId })
    .populate({ path: "user", select: "name profileImage totalPoints" })
    .sort({ qualificationPoints: -1 })
    .lean();
  return { data: { ...contest, entries: attachId(entries) } };
}

/**
 * Finalise a contest: compute ranks, award bonus points (not tier points) and gifts.
 */
async function adminFinaliseContest(contestId) {
  const contest = await Contest.findById(contestId);
  if (!contest) sendFailResponse("Contest not found", 404);
  if (contest.status !== CONTEST_STATUS.COMPLETED) {
    contest.status = CONTEST_STATUS.COMPLETED;
    await contest.save();
  }

  // Fetch all entries ordered by qualificationPoints DESC
  const entries = await ContestEntry.find({ contestId })
    .populate("user")
    .sort({ qualificationPoints: -1 });

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    entry.rank = i + 1;

    // Find matching prize
    const prize = contest.prizes.find((p) => p.rank === i + 1);
    if (prize) {
      if (prize.rewardType === "points" && prize.points > 0) {
        // Award BONUS points only — deliberately NOT calling loyaltyService.processQrScanPoints
        // so these points do NOT affect tier qualification
        const user = await User.findById(entry.userId);
        if (user) {
          user.totalPoints += prize.points;
          user.lifetimePoints = (user.lifetimePoints || 0) + prize.points;
          await user.save();
        }
        entry.bonusPointsAwarded = prize.points;
        entry.rewardType = "points";
      }
      // Physical gift: create GiftRedemption programmatically (if gift module supports it)
      // For now, mark for manual processing
      if (prize.rewardType === "gift") {
        entry.rewardType = "gift";
      }
      entry.rewardStatus = ENTRY_REWARD_STATUS.CREDITED;
    }
    await entry.save();

    // Push notification to winner
    const user = entry.user;
    if (user?.fcmTokens?.length && user?.enableNotification && prize) {
      const msg = prize.rewardType === "points"
        ? `You won ${prize.points} Bonus Points in ${contest.name}! 🏆`
        : `You won a ${prize.giftName || "prize"} in ${contest.name}! 🏆`;
      await sendFcmNotifications(
        user.fcmTokens,
        `Contest Result: ${contest.name}`,
        msg,
        { type: "CONTEST_WON", contestId: contestId.toString() },
      ).catch(() => {});
    }
  }

  return { message: "Contest finalised", data: { ranked: entries.length } };
}

// ─── User ────────────────────────────────────────────────────────────────────

async function userListContests(query = {}) {
  const { page = 1, limit = 20, status } = query;
  const skip = (page - 1) * limit;

  // Sync statuses before returning
  const now = new Date();
  await Contest.updateMany(
    { startDate: { $lte: now }, endDate: { $gte: now }, status: CONTEST_STATUS.UPCOMING },
    { $set: { status: CONTEST_STATUS.ACTIVE } },
  );
  await Contest.updateMany(
    { endDate: { $lt: now }, status: { $ne: CONTEST_STATUS.COMPLETED } },
    { $set: { status: CONTEST_STATUS.COMPLETED } },
  );

  const filter = { active: true };
  if (status) filter.status = status;

  const [contests, total] = await Promise.all([
    Contest.find(filter).sort({ startDate: 1 }).skip(skip).limit(limit).lean(),
    Contest.countDocuments(filter),
  ]);

  return {
    data: {
      contests: attachId(contests),
      page, limit, total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function userGetContestDetails(contestId, userId) {
  const contest = await Contest.findById(contestId).lean();
  if (!contest) sendFailResponse("Contest not found", 404);

  // Top-10 leaderboard
  const topEntries = await ContestEntry.find({ contestId })
    .populate({ path: "user", select: "name profileImage" })
    .sort({ qualificationPoints: -1 })
    .limit(10)
    .lean();

  // User's own entry + rank
  let userEntry = null;
  let userRank = null;
  if (userId) {
    const allSortedCount = await ContestEntry.countDocuments({
      contestId,
      qualificationPoints: { $gt: 0 },
    });
    userEntry = await ContestEntry.findOne({ contestId, userId }).lean();
    if (userEntry) {
      userRank = await ContestEntry.countDocuments({
        contestId,
        qualificationPoints: { $gt: userEntry.qualificationPoints },
      }) + 1;
    }
  }

  return {
    data: {
      contest,
      leaderboard: attachId(topEntries),
      userEntry,
      userRank,
    },
  };
}

async function userGetLeaderboard(contestId) {
  const contest = await Contest.findById(contestId);
  if (!contest) sendFailResponse("Contest not found", 404);
  const entries = await ContestEntry.find({ contestId })
    .populate({ path: "user", select: "name profileImage" })
    .sort({ qualificationPoints: -1 })
    .limit(10)
    .lean();
  return { data: { leaderboard: attachId(entries) } };
}

/**
 * General (all-time) leaderboard based on user.totalPoints.
 */
async function generalLeaderboard(userId) {
  const topUsers = await User.find({ isActive: true })
    .select("name profileImage totalPoints currentTierId")
    .populate("currentTierId", "name colorIdentity badgeUrl")
    .sort({ totalPoints: -1 })
    .limit(10)
    .lean();

  let userRank = null;
  let userEntry = null;
  let nearby = null;

  if (userId) {
    const user = await User.findById(userId)
      .select("name totalPoints profileImage currentTierId")
      .populate("currentTierId", "name colorIdentity badgeUrl")
      .lean();

    if (user) {
      userRank = await User.countDocuments({
        isActive: true,
        totalPoints: { $gt: user.totalPoints },
      }) + 1;
      userEntry = user;

      // Find the user immediately above (next higher points or tie-break)
      const userAbove = await User.findOne({
        isActive: true,
        $or: [
          { totalPoints: { $gt: user.totalPoints } },
          { totalPoints: user.totalPoints, _id: { $lt: user._id } }
        ]
      })
      .select("name totalPoints profileImage currentTierId")
      .populate("currentTierId", "name colorIdentity badgeUrl")
      .sort({ totalPoints: 1, _id: -1 })
      .lean();

      // Find the user immediately below
      const userBelow = await User.findOne({
        isActive: true,
        $or: [
          { totalPoints: { $lt: user.totalPoints } },
          { totalPoints: user.totalPoints, _id: { $gt: user._id } }
        ]
      })
      .select("name totalPoints profileImage currentTierId")
      .populate("currentTierId", "name colorIdentity badgeUrl")
      .sort({ totalPoints: -1, _id: 1 })
      .lean();

      const aboveRank = userAbove ? await User.countDocuments({ isActive: true, totalPoints: { $gt: userAbove.totalPoints } }) + 1 : null;
      const belowRank = userBelow ? await User.countDocuments({ isActive: true, totalPoints: { $gt: userBelow.totalPoints } }) + 1 : null;

      nearby = {
        above: userAbove ? { ...attachId(userAbove), rank: aboveRank } : null,
        user: { ...attachId(user), rank: userRank },
        below: userBelow ? { ...attachId(userBelow), rank: belowRank } : null,
      };
    }
  }

  return {
    data: {
      leaderboard: attachId(topUsers),
      userRank,
      userEntry: userEntry ? attachId(userEntry) : null,
      nearby,
    },
  };
}


// ─── Contest Entry (called by loyalty engine on each scan) ───────────────────

/**
 * Upserts the user's entry in all active contests, incrementing their
 * qualificationPoints snapshot to match current progress.
 */
async function syncUserContestEntries(userId, currentQualificationPoints) {
  const now = new Date();
  const activeContests = await Contest.find({
    status: CONTEST_STATUS.ACTIVE,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).lean();

  for (const contest of activeContests) {
    await ContestEntry.findOneAndUpdate(
      { contestId: contest._id, userId },
      { $set: { qualificationPoints: currentQualificationPoints } },
      { upsert: true, new: true },
    );
  }
}

module.exports = {
  adminCreateContest,
  adminUpdateContest,
  adminDeleteContest,
  adminListContests,
  adminGetContestDetails,
  adminFinaliseContest,
  userListContests,
  userGetContestDetails,
  userGetLeaderboard,
  generalLeaderboard,
  syncUserContestEntries,
};

const { Contest } = require("../../schemas/contest.schema");
const { ContestEntry } = require("../../schemas/contest-entry.schema");
const User = require("../../schemas/user.schema");
const Gift = require("../../schemas/gift.schema");
const GiftRedemption = require("../../schemas/gift-redemption.schema");
const { GIFT_REDEMPTION_STATUS, REWARD_CAUSE } = require("../../constants/gift");
const { evaluateRuleSet } = require("../rule-set/rule-set.evaluator");
const { attachId, formatNotification } = require("../../utils/heplers");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { sendFcmNotifications } = require("../../functions/fcm");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const {
  CONTEST_STATUS,
  REWARD_TYPE,
  ENTRY_REWARD_STATUS,
  CONTEST_FCM_TYPES,
  CONTEST_MESSAGES,
  CONTEST_ERRORS,
  CONTEST_CONFIG,
} = require("../../constants/contests");

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveContestStatus(contest) {
  const now = new Date();
  if (now < new Date(contest.startDate)) return CONTEST_STATUS.UPCOMING;
  if (now > new Date(contest.endDate)) return CONTEST_STATUS.COMPLETED;
  return CONTEST_STATUS.ONGOING;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

async function adminCreateContest(data, adminId) {
  const {
    name,
    description,
    bannerImage,
    rewardSummary,
    startDate,
    endDate,
    region,
    prizes,
    ruleSetId,
    active,
  } = data;
  const contest = await Contest.create({
    name,
    description,
    bannerImage,
    rewardSummary,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    region: region || null,
    prizes: prizes || [],
    ruleSetId: ruleSetId || null,
    active: active !== undefined ? active : true,
    createdBy: adminId,
    status:
      new Date(startDate) > new Date()
        ? CONTEST_STATUS.UPCOMING
        : CONTEST_STATUS.ONGOING,
  });
  return {
    message: CONTEST_MESSAGES.CREATED,
    data: { contestId: contest._id },
  };
}

async function adminUpdateContest(contestId, data) {
  const contest = await Contest.findById(contestId);
  if (!contest) {
    sendFailResponse(CONTEST_ERRORS.CONTEST_NOT_FOUND, 404);
  }

  // A completed or cancelled contest cannot be re-activated
  if (
    (contest.status === CONTEST_STATUS.COMPLETED ||
      contest.status === CONTEST_STATUS.CANCELLED ||
      new Date() > new Date(contest.endDate)) &&
    data.active === true
  ) {
    sendFailResponse("Completed or cancelled contests cannot be re-activated", 400);
  }

  Object.assign(contest, data);
  if (data.startDate || data.endDate) {
    contest.status = resolveContestStatus(contest);
  }
  await contest.save();
  return { message: CONTEST_MESSAGES.UPDATED, data: { updated: true } };
}

async function adminCancelContest(contestId, adminId) {
  const contest = await Contest.findById(contestId);
  if (!contest) {
    sendFailResponse(CONTEST_ERRORS.CONTEST_NOT_FOUND, 404);
  }
  if (contest.status !== CONTEST_STATUS.UPCOMING) {
    sendFailResponse("Only upcoming contests can be cancelled", 400);
  }
  contest.status = CONTEST_STATUS.CANCELLED;
  contest.active = false;
  contest.isCancelled = true;
  if (adminId) contest.cancelledBy = adminId;
  contest.cancelledAt = new Date();
  await contest.save();
  return { message: "Contest cancelled successfully", data: { cancelled: true } };
}

async function adminDeleteContest(contestId) {
  await Contest.findByIdAndDelete(contestId);
  return { message: CONTEST_MESSAGES.DELETED, data: { deleted: true } };
}

async function adminListContests(query = {}) {
  const page = Math.max(1, parseInt(query.page) || CONTEST_CONFIG.DEFAULT_PAGE);
  const limit = Math.max(
    1,
    parseInt(query.limit) || CONTEST_CONFIG.DEFAULT_LIMIT,
  );
  const skip = (page - 1) * limit;
  const filter = {};
  if (query.status) filter.status = query.status;

  if (query.search && query.search.trim()) {
    filter.name = { $regex: query.search.trim(), $options: "i" };
  }

  if (query.startDate) {
    filter.startDate = { $gte: new Date(query.startDate) };
  }

  if (query.endDate) {
    filter.endDate = { $lte: new Date(query.endDate) };
  }

  const [contests, total] = await Promise.all([
    Contest.find(filter).sort({ startDate: -1 }).skip(skip).limit(limit).lean(),
    Contest.countDocuments(filter),
  ]);
  return {
    data: {
      contests: attachId(contests),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function adminGetContestDetails(contestId) {
  const contest = await Contest.findById(contestId)
    .populate("ruleSetId")
    .populate({ path: "finalizedBy", select: "name email" })
    .populate({ path: "cancelledBy", select: "name email" })
    .lean();
  if (!contest) {
    sendFailResponse(CONTEST_ERRORS.CONTEST_NOT_FOUND, 404);
  }
  const entries = await ContestEntry.find({ contestId })
    .populate({ path: "user", select: "name profileImage totalPoints" })
    .sort({ qualificationPoints: -1 })
    .lean();
  return { data: { ...contest, entries: attachId(entries) } };
}

/**
 * Finalise a contest: compute ranks, award bonus points and gifts. Set status to completed, active to false, and record audit fields.
 */
async function adminFinaliseContest(contestId, adminId) {
  const contest = await Contest.findById(contestId);
  if (!contest) {
    sendFailResponse(CONTEST_ERRORS.CONTEST_NOT_FOUND, 404);
  }

  if (contest.status !== CONTEST_STATUS.ONGOING) {
    sendFailResponse("Only ongoing contests can be finalised", 400);
  }

  // Mark as completed and deactivate
  contest.status = CONTEST_STATUS.COMPLETED;
  contest.active = false;
  contest.isFinalizedManually = true;
  if (adminId) contest.finalizedBy = adminId;
  contest.finalizedAt = new Date();
  await contest.save();

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
      if (prize.rewardType === REWARD_TYPE.POINTS && prize.points > 0) {
        // Award BONUS points only — deliberately NOT calling loyaltyService.processQrScanPoints
        // so these points do NOT affect tier qualification
        const user = await User.findById(entry.userId);
        if (user) {
          user.totalPoints += prize.points;
          user.lifetimePoints = (user.lifetimePoints || 0) + prize.points;
          await user.save();
        }
        entry.bonusPointsAwarded = prize.points;
        entry.rewardType = REWARD_TYPE.POINTS;
      }
      if (prize.rewardType === REWARD_TYPE.GIFT) {
        entry.rewardType = REWARD_TYPE.GIFT;
        if (prize.giftId && !entry.giftRedemptionId) {
          const gift = await Gift.findById(prize.giftId);
          if (gift) {
            const isVoucher = gift.giftType === "voucher";
            const giftRedemption = await GiftRedemption.create({
              userId: entry.userId,
              giftId: gift._id,
              coinsUsed: 0,
              giftType: gift.giftType,
              status: isVoucher
                ? GIFT_REDEMPTION_STATUS.DELIVERED
                : GIFT_REDEMPTION_STATUS.PROCESSING,
              isReward: true,
              rewardCause: REWARD_CAUSE.CONTEST,
              rewardCauseId: contest._id,
              rewardCauseTitle: `Contest Win: ${contest.name} (Rank #${entry.rank})`,
              ...(isVoucher && {
                voucherCode: gift.voucherCode || undefined,
                voucherFileUrl: gift.voucherFileUrl || undefined,
                voucherSent: true,
              }),
            });
            entry.giftRedemptionId = giftRedemption._id;
          }
        }
      }
      entry.rewardStatus = ENTRY_REWARD_STATUS.CREDITED;
    }
    await entry.save();

    // Push notification to winner
    const user = entry.user;
    if (user?.fcmTokens?.length && user?.enableNotification && prize) {
      const prizeText =
        prize.rewardType === REWARD_TYPE.POINTS
          ? `${prize.points} Bonus Points`
          : `a ${prize.giftName || "prize"}`;
      await sendFcmNotifications(
        user.fcmTokens,
        formatNotification(APP_NOTIFICATIONS.contests.contestWon.title, {
          contestName: contest.name,
        }),
        formatNotification(APP_NOTIFICATIONS.contests.contestWon.body, {
          prizeText,
          contestName: contest.name,
        }),
        {
          type: CONTEST_FCM_TYPES.CONTEST_WON,
          contestId: contestId.toString(),
        },
      ).catch(() => {});
    }
  }

  return {
    message: CONTEST_MESSAGES.FINALISED,
    data: { ranked: entries.length },
  };
}

// ─── User ────────────────────────────────────────────────────────────────────

async function userListContests(query = {}, userId) {
  const page = Math.max(1, parseInt(query.page) || CONTEST_CONFIG.DEFAULT_PAGE);
  const limit = Math.max(
    1,
    parseInt(query.limit) || CONTEST_CONFIG.DEFAULT_LIMIT,
  );
  const skip = (page - 1) * limit;

  // Sync statuses before returning
  const now = new Date();
  await Contest.updateMany(
    { startDate: { $gt: now }, status: { $ne: CONTEST_STATUS.UPCOMING } },
    { $set: { status: CONTEST_STATUS.UPCOMING } },
  );
  await Contest.updateMany(
    {
      startDate: { $lte: now },
      endDate: { $gte: now },
      status: { $ne: CONTEST_STATUS.ACTIVE },
    },
    { $set: { status: CONTEST_STATUS.ACTIVE } },
  );
  await Contest.updateMany(
    { endDate: { $lt: now }, status: { $ne: CONTEST_STATUS.COMPLETED } },
    { $set: { status: CONTEST_STATUS.COMPLETED } },
  );

  const filter = { active: true };
  if (query.status) filter.status = query.status;

  const [contests, total] = await Promise.all([
    Contest.find(filter).sort({ startDate: 1 }).skip(skip).limit(limit).lean(),
    Contest.countDocuments(filter),
  ]);

  let contestsWithEntries = attachId(contests);
  if (userId) {
    const contestIds = contests.map((c) => c._id);
    const entries = await ContestEntry.find({
      contestId: { $in: contestIds },
      userId,
    }).lean();
    const entryMap = {};
    entries.forEach((e) => {
      entryMap[e.contestId.toString()] = e;
    });
    contestsWithEntries = contestsWithEntries.map((c) => ({
      ...c,
      userEntry: entryMap[c._id.toString()] || null,
    }));
  }

  return {
    data: {
      contests: contestsWithEntries,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function userGetContestDetails(contestId, userId) {
  const contest = await Contest.findById(contestId)
    .populate("products")
    .populate("tiers")
    .lean();
  if (!contest) {
    sendFailResponse(CONTEST_ERRORS.CONTEST_NOT_FOUND, 404);
  }

  // All contest entries sorted by qualificationPoints DESC
  const topEntries = await ContestEntry.find({ contestId })
    .populate({ path: "user", select: "name profileImage" })
    .sort({ qualificationPoints: -1 })
    .lean();

  // User's own entry + rank
  let userEntry = null;
  let userRank = null;
  if (userId) {
    userEntry = await ContestEntry.findOne({ contestId, userId }).lean();
    if (userEntry) {
      userRank =
        (await ContestEntry.countDocuments({
          contestId,
          qualificationPoints: { $gt: userEntry.qualificationPoints },
        })) + 1;
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
  const contest = await Contest.findById(contestId).lean();
  if (!contest) {
    sendFailResponse(CONTEST_ERRORS.CONTEST_NOT_FOUND, 404);
  }
  const entries = await ContestEntry.find({ contestId })
    .populate({ path: "user", select: "name profileImage" })
    .sort({ qualificationPoints: -1 })
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
    .limit(CONTEST_CONFIG.GENERAL_LEADERBOARD_LIMIT)
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
      userRank =
        (await User.countDocuments({
          isActive: true,
          totalPoints: { $gt: user.totalPoints },
        })) + 1;
      userEntry = user;

      // Find the user immediately above (next higher points or tie-break)
      const userAbove = await User.findOne({
        isActive: true,
        $or: [
          { totalPoints: { $gt: user.totalPoints } },
          { totalPoints: user.totalPoints, _id: { $lt: user._id } },
        ],
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
          { totalPoints: user.totalPoints, _id: { $gt: user._id } },
        ],
      })
        .select("name totalPoints profileImage currentTierId")
        .populate("currentTierId", "name colorIdentity badgeUrl")
        .sort({ totalPoints: -1, _id: 1 })
        .lean();

      const aboveRank = userAbove
        ? (await User.countDocuments({
            isActive: true,
            totalPoints: { $gt: userAbove.totalPoints },
          })) + 1
        : null;
      const belowRank = userBelow
        ? (await User.countDocuments({
            isActive: true,
            totalPoints: { $gt: userBelow.totalPoints },
          })) + 1
        : null;

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

async function syncUserContestEntries(
  userId,
  pointsAwarded,
  productId,
  currentTierId,
) {
  const now = new Date();
  const activeContests = await Contest.find({
    active: true,
    status: { $in: [CONTEST_STATUS.ONGOING, CONTEST_STATUS.ACTIVE] },
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).populate("ruleSetId").lean();

  const user = await User.findById(userId).lean();
  if (!user) return;

  for (const contest of activeContests) {
    if (contest.ruleSetId) {
      try {
        const ruleSetObj =
          typeof contest.ruleSetId === "object"
            ? contest.ruleSetId
            : await require("mongoose").model("RuleSet").findById(contest.ruleSetId).lean();
        if (ruleSetObj) {
          const isEligible = await evaluateRuleSet(ruleSetObj, user, { productId, currentTierId });
          if (!isEligible) continue;
        }
      } catch (err) {
        console.error("RuleSet evaluation failed for contest:", contest._id, err);
      }
    }

    await ContestEntry.findOneAndUpdate(
      { contestId: contest._id, userId },
      { $inc: { qualificationPoints: pointsAwarded } },
      { upsert: true, new: true },
    );
  }
}

async function userClaimReward(contestId, userId) {
  const entry = await ContestEntry.findOne({ contestId, userId });
  if (!entry) {
    sendFailResponse(CONTEST_ERRORS.ENTRY_NOT_FOUND, 404);
  }
  const contest = await Contest.findById(contestId).lean();
  if (!contest) {
    sendFailResponse(CONTEST_ERRORS.CONTEST_NOT_FOUND, 404);
  }

  const status = resolveContestStatus(contest);
  if (status !== CONTEST_STATUS.COMPLETED) {
    sendFailResponse(CONTEST_ERRORS.NOT_COMPLETED, 400);
  }
  if (entry.rewardStatus === ENTRY_REWARD_STATUS.CREDITED) {
    sendFailResponse(CONTEST_ERRORS.ALREADY_CLAIMED, 400);
  }

  const prize = contest.prizes.find((p) => p.rank === entry.rank);
  if (!prize) {
    sendFailResponse(CONTEST_ERRORS.NO_PRIZE_FOR_RANK, 400);
  }

  if (prize.rewardType === REWARD_TYPE.POINTS) {
    const user = await User.findById(userId);
    if (user) {
      user.totalPoints = (user.totalPoints || 0) + (prize.points || 0);
      await user.save();
    }
    entry.rewardType = REWARD_TYPE.POINTS;
    entry.bonusPointsAwarded = prize.points;
  } else if (prize.rewardType === REWARD_TYPE.GIFT) {
    entry.rewardType = REWARD_TYPE.GIFT;
    if (prize.giftId && !entry.giftRedemptionId) {
      const gift = await Gift.findById(prize.giftId);
      if (gift) {
        const isVoucher = gift.giftType === "voucher";
        const giftRedemption = await GiftRedemption.create({
          userId,
          giftId: gift._id,
          coinsUsed: 0,
          giftType: gift.giftType,
          status: isVoucher
            ? GIFT_REDEMPTION_STATUS.DELIVERED
            : GIFT_REDEMPTION_STATUS.PROCESSING,
          isReward: true,
          rewardCause: REWARD_CAUSE.CONTEST,
          rewardCauseId: contest._id,
          rewardCauseTitle: `Contest Win: ${contest.name} (Rank #${entry.rank})`,
          ...(isVoucher && {
            voucherCode: gift.voucherCode || undefined,
            voucherFileUrl: gift.voucherFileUrl || undefined,
            voucherSent: true,
          }),
        });
        entry.giftRedemptionId = giftRedemption._id;
      }
    }
  }

  entry.rewardStatus = ENTRY_REWARD_STATUS.CREDITED;
  await entry.save();

  return {
    data: {
      message: CONTEST_MESSAGES.REWARD_CLAIMED,
      userEntry: attachId(entry),
    },
  };
}

/**
 * Returns total contest counts per status in a single aggregation query.
 */
async function adminGetContestSummary() {
  const [result] = await Contest.aggregate([
    {
      $facet: {
        all: [{ $count: "count" }],
        upcoming: [
          { $match: { status: CONTEST_STATUS.UPCOMING } },
          { $count: "count" },
        ],
        ongoing: [
          {
            $match: {
              status: { $in: [CONTEST_STATUS.ONGOING, CONTEST_STATUS.ACTIVE] },
            },
          },
          { $count: "count" },
        ],
        completed: [
          { $match: { status: CONTEST_STATUS.COMPLETED } },
          { $count: "count" },
        ],
      },
    },
  ]);

  const ongoingCount = result?.ongoing?.[0]?.count ?? 0;

  return {
    data: {
      all: result?.all?.[0]?.count ?? 0,
      upcoming: result?.upcoming?.[0]?.count ?? 0,
      ongoing: ongoingCount,
      active: ongoingCount,
      completed: result?.completed?.[0]?.count ?? 0,
    },
  };
}

module.exports = {
  adminCreateContest,
  adminUpdateContest,
  adminCancelContest,
  adminDeleteContest,
  adminListContests,
  adminGetContestSummary,
  adminGetContestDetails,
  adminFinaliseContest,
  userListContests,
  userGetContestDetails,
  userGetLeaderboard,
  generalLeaderboard,
  syncUserContestEntries,
  userClaimReward,
};


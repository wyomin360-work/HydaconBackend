const mongoose = require("mongoose");
const { Contest } = require("../../schemas/contest.schema");
const { ContestEntry } = require("../../schemas/contest-entry.schema");
const User = require("../../schemas/user.schema");
const Gift = require("../../schemas/gift.schema");
const GiftRedemption = require("../../schemas/gift-redemption.schema");
const giftService = require("../gift/gift.service");
const { RuleSet } = require("../../schemas/rule-set.schema");
const ContestTransaction = require("../../schemas/contest-transaction.schema");
const {
  GIFT_REDEMPTION_STATUS,
  REWARD_CAUSE,
} = require("../../constants/gift");
const { evaluateRuleSet } = require("../rule-set/rule-set.evaluator");
const { attachId, formatNotification } = require("../../utils/heplers");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { sendFcmNotifications } = require("../../functions/fcm");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const { updateUserPoints } = require("../user/user.service");
const {
  POINTS_TRANSACTION_TYPE,
  POINTS_TRANSACTION_REASON,
} = require("../../constants/points");
const {
  CONTEST_STATUS,
  REWARD_TYPE,
  ENTRY_REWARD_STATUS,
  CONTEST_FCM_TYPES,
  CONTEST_MESSAGES,
  CONTEST_ERRORS,
  CONTEST_CONFIG,
  CONTEST_METRICS,
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
    metric,
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
    metric,
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
    data: { contestCreated: true, contestId: contest._id },
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
    sendFailResponse(
      "Completed or cancelled contests cannot be re-activated",
      400,
    );
  }

  Object.assign(contest, data);
  if (data.startDate || data.endDate) {
    contest.status = resolveContestStatus(contest);
  }
  await contest.save();
  return { message: CONTEST_MESSAGES.UPDATED, data: { contestUpdated: true } };
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
  return {
    message: "Contest cancelled successfully",
    data: { contestCancelled: true },
  };
}

async function adminDeleteContest(contestId) {
  await Contest.findByIdAndDelete(contestId);
  return { message: CONTEST_MESSAGES.DELETED, data: { contestDeleted: true } };
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

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Mark as completed and deactivate
    contest.status = CONTEST_STATUS.COMPLETED;
    contest.active = false;
    contest.isFinalizedManually = true;
    if (adminId) contest.finalizedBy = adminId;
    contest.finalizedAt = new Date();
    await contest.save({ session });

    // Fetch all entries ordered by qualificationPoints DESC
    const entries = await ContestEntry.find({ contestId })
      .populate("user")
      .sort({ qualificationPoints: -1 })
      .session(session);

    const notificationsToSend = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      entry.rank = i + 1;

      // Find matching prize
      const prize = contest.prizes.find((p) => p.rank === i + 1);
      if (prize) {
        if (prize.rewardType === REWARD_TYPE.POINTS && prize.points > 0) {
          await updateUserPoints({
            userId: entry.userId,
            amount: prize.points,
            transactionType: POINTS_TRANSACTION_TYPE.CREDIT,
            reason: POINTS_TRANSACTION_REASON.CONTEST_WIN,
            description: `Prize for contest: ${contest.name}`,
            metadata: { contestId: contest._id, rank: prize.rank },
            session: session,
          });
          entry.bonusPointsAwarded = prize.points;
          entry.rewardType = REWARD_TYPE.POINTS;
          entry.rewardStatus = ENTRY_REWARD_STATUS.CREDITED;
        } else if (prize.rewardType === REWARD_TYPE.COIN && prize.coins > 0) {
          const user = await User.findById(entry.userId).session(session);
          if (user) {
            user.hydaconCoins = (user.hydaconCoins || 0) + prize.coins;
            user.lifetimeHydaconCoins =
              (user.lifetimeHydaconCoins || 0) + prize.coins;
            await user.save({ session });
          }
          entry.bonusCoinsAwarded = prize.coins;
          entry.rewardType = REWARD_TYPE.COIN;
          entry.rewardStatus = ENTRY_REWARD_STATUS.CREDITED;
        } else if (prize.rewardType === REWARD_TYPE.GIFT) {
          entry.rewardType = REWARD_TYPE.GIFT;
          if (prize.giftId) {
            const gift = await Gift.findById(prize.giftId).session(session);
            if (gift) {
              const isVoucher = gift.giftType === "voucher";
              if (isVoucher) {
                const giftRedemption = await GiftRedemption.create(
                  [
                    {
                      userId: entry.userId,
                      giftId: gift._id,
                      coinsUsed: 0,
                      giftType: gift.giftType,
                      status: GIFT_REDEMPTION_STATUS.DELIVERED,
                      isReward: true,
                      rewardCause: REWARD_CAUSE.CONTEST,
                      rewardCauseId: contest._id,
                      rewardCauseTitle: `Contest Win: ${contest.name} (Rank #${entry.rank})`,
                      voucherCode: gift.voucherCode || undefined,
                      voucherFileUrl: gift.voucherFileUrl || undefined,
                      voucherSent: true,
                    },
                  ],
                  { session },
                );
                entry.giftRedemptionId = giftRedemption[0]._id;
                entry.rewardStatus = ENTRY_REWARD_STATUS.CREDITED;
              } else {
                // Physical gift: defer claim, add to rewardedUsers list and reserve stock
                const awardResult = await giftService.awardPhysicalGiftToUser(
                  entry.userId,
                  gift,
                  {
                    rewardCause: REWARD_CAUSE.CONTEST,
                    rewardCauseId: contest._id,
                    rewardCauseTitle: `Contest Win: ${contest.name} (Rank #${entry.rank})`,
                  },
                  session,
                );
                if (awardResult.success) {
                  entry.rewardStatus = ENTRY_REWARD_STATUS.PENDING;
                } else {
                  console.error(
                    "Failed to award physical gift to user:",
                    awardResult.message,
                  );
                  entry.rewardStatus = ENTRY_REWARD_STATUS.PENDING;
                }
              }
            }
          }
        }
      }
      await entry.save({ session });

      // Push notification to winner (executed after committing to prevent transaction delays/timeouts)
      const user = entry.user;
      if (user?.fcmTokens?.length && user?.enableNotification && prize) {
        const prizeText =
          prize.rewardType === REWARD_TYPE.POINTS
            ? `${prize.points} Bonus Points`
            : prize.rewardType === REWARD_TYPE.COIN
              ? `${prize.coins} Hydacon Coins`
              : `a ${prize.giftName || "prize"}`;
        notificationsToSend.push({
          fcmTokens: user.fcmTokens,
          title: APP_NOTIFICATIONS.contests.contestWon.title,
          body: APP_NOTIFICATIONS.contests.contestWon.body,
          prizeText,
          contestName: contest.name,
        });
      }
    }

    await session.commitTransaction();

    // Send notifications after transaction commits successfully
    for (const notif of notificationsToSend) {
      sendFcmNotifications(
        notif.fcmTokens,
        formatNotification(notif.title, {
          contestName: notif.contestName,
        }),
        formatNotification(notif.body, {
          prizeText: notif.prizeText,
          contestName: notif.contestName,
        }),
        {
          type: CONTEST_FCM_TYPES.CONTEST_WON,
          contestId: contestId.toString(),
        },
      ).catch(() => {});
    }

    return {
      message: CONTEST_MESSAGES.FINALISED,
      data: { contestFinalised: true, ranked: entries.length },
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
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
    {
      startDate: { $gt: now },
      status: {
        $nin: [
          CONTEST_STATUS.UPCOMING,
          CONTEST_STATUS.COMPLETED,
          CONTEST_STATUS.CANCELLED,
        ],
      },
    },
    { $set: { status: CONTEST_STATUS.UPCOMING } },
  );
  await Contest.updateMany(
    {
      startDate: { $lte: now },
      endDate: { $gte: now },
      status: {
        $nin: [
          CONTEST_STATUS.ACTIVE,
          CONTEST_STATUS.COMPLETED,
          CONTEST_STATUS.CANCELLED,
        ],
      },
    },
    { $set: { status: CONTEST_STATUS.ACTIVE } },
  );

  const filter = {};
  if (query.status) {
    filter.status = query.status;
    if (query.status === CONTEST_STATUS.ONGOING) {
      filter.active = true;
      filter.endDate = { $gte: new Date() };
    } else if (query.status === CONTEST_STATUS.UPCOMING) {
      filter.active = true;
      filter.startDate = { $gte: new Date() };
    } else if (query.status === CONTEST_STATUS.COMPLETED) {
      filter.status = CONTEST_STATUS.COMPLETED;
    }
  } else {
    filter.active = true;
  }

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
  const contest = await Contest.findById(contestId).lean();
  if (!contest) {
    sendFailResponse(CONTEST_ERRORS.CONTEST_NOT_FOUND, 404);
  }

  // All contest entries sorted by qualificationPoints DESC
  const topEntries = await ContestEntry.find({ contestId })
    .populate({
      path: "user",
      select: "name profileImage currentTierId totalPoints",
      populate: {
        path: "currentTierId",
        select: "name colorIdentity badgeUrl",
      },
    })
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
    .populate({
      path: "user",
      select: "name profileImage currentTierId totalPoints",
      populate: {
        path: "currentTierId",
        select: "name colorIdentity badgeUrl",
      },
    })
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
  transactionId,
) {
  const now = new Date();
  const activeContests = await Contest.find({
    active: true,
    status: { $in: [CONTEST_STATUS.ONGOING, CONTEST_STATUS.ACTIVE] },
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .populate("ruleSetId")
    .lean();

  const user = await User.findById(userId).lean();
  if (!user) return;

  for (const contest of activeContests) {
    if (contest.ruleSetId) {
      try {
        const ruleSetObj =
          typeof contest.ruleSetId === "object"
            ? contest.ruleSetId
            : await RuleSet.findById(contest.ruleSetId).lean();
        if (ruleSetObj) {
          const isEligible = await evaluateRuleSet(ruleSetObj, user, {
            productId,
            currentTierId,
          });
          if (!isEligible) continue;
        }
      } catch (err) {
        console.error(
          "RuleSet evaluation failed for contest:",
          contest._id,
          err,
        );
      }
    }

    let metricValue = 0;
    if (contest.metric === CONTEST_METRICS.SCAN_COUNT) {
      metricValue = 1;
    } else {
      metricValue = pointsAwarded;
    }

    if (transactionId) {
      try {
        await ContestTransaction.create({
          contestId: contest._id,
          userId,
          transactionId,
          metric: contest.metric || CONTEST_METRICS.POINTS,
          metricValue,
        });
      } catch (err) {
        if (err.code === 11000) {
          // Duplicate transaction, safely skip updating ContestEntry
          continue;
        }
        console.error("Failed to record ContestTransaction:", err);
      }
    }

    await ContestEntry.findOneAndUpdate(
      { contestId: contest._id, userId },
      { $inc: { qualificationPoints: metricValue } },
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
    if (prize.points > 0) {
      await updateUserPoints({
        userId: userId,
        amount: prize.points,
        transactionType: POINTS_TRANSACTION_TYPE.CREDIT,
        reason: POINTS_TRANSACTION_REASON.CONTEST_WIN,
        description: `Manual prize for contest rank`,
        metadata: { contestId, rank: prize.rank },
      });
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

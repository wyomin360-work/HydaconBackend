const mongoose = require("mongoose");
const Contest = require("../../schemas/contest.schema");
const User = require("../../schemas/user.schema");
const LoyaltyTransaction = require("../../schemas/loyalty-transaction.schema");
const Gift = require("../../schemas/gift.schema");
const GiftRedemption = require("../../schemas/gift-redemption.schema");
const { LOYALTY_TRANSACTION_TYPES, LOYALTY_TRANSACTION_SOURCES } = require("../../constants/loyalty");
const { sendFcmNotifications } = require("../../functions/fcm");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const { formatNotification } = require("../../utils/heplers");

// Admin Functions

exports.createContest = async (data) => {
  try {
    const contest = new Contest(data);
    await contest.save();

    // Send announcement notification
    if (contest.isActive) {
      let userQuery = { enableNotification: true, fcmTokens: { $exists: true, $not: { $size: 0 } } };
      if (contest.region && contest.region !== "ALL") {
        userQuery.areaOfOperation = contest.region;
      }
      
      const usersToNotify = await User.find(userQuery).select("fcmTokens");
      const tokens = usersToNotify.map((u) => u.fcmTokens).flat();
      
      if (tokens.length > 0) {
        const uniqueTokens = [...new Set(tokens)];
        await sendFcmNotifications(
          uniqueTokens,
          APP_NOTIFICATIONS.contests.announcement.title,
          formatNotification(APP_NOTIFICATIONS.contests.announcement.body, { contestName: contest.name })
        );
      }
    }

    return { success: true, message: "Contest created successfully", data: contest };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.updateContest = async (contestId, data) => {
  try {
    const contest = await Contest.findByIdAndUpdate(contestId, data, { new: true });
    if (!contest) return { success: false, message: "Contest not found" };
    return { success: true, message: "Contest updated successfully", data: contest };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.listContests = async (data) => {
  try {
    const { page = 1, limit = 10, search = "", status } = data;
    const skip = (page - 1) * limit;
    let query = {};
    if (search) query.name = { $regex: search, $options: "i" };

    if (status === "ACTIVE") {
      const now = new Date();
      query.isActive = true;
      query.startDate = { $lte: now };
      query.endDate = { $gte: now };
    } else if (status === "UPCOMING") {
      const now = new Date();
      query.isActive = true;
      query.startDate = { $gt: now };
    } else if (status === "COMPLETED") {
      const now = new Date();
      query.endDate = { $lt: now };
    } else if (status === "DISABLED") {
      query.isActive = false;
    }

    const contests = await Contest.find(query)
      .populate("prizeStructure.giftId", "name image")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Contest.countDocuments(query);
    return {
      success: true,
      data: {
        records: contests,
        total,
        totalPages: Math.ceil(total / limit),
        page,
        limit,
      },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.getContestById = async (contestId) => {
  try {
    const contest = await Contest.findById(contestId)
      .populate("prizeStructure.giftId", "name image")
      .populate("winners.userId", "name profilePhoto")
      .populate("winners.giftId", "name image");
    if (!contest) return { success: false, message: "Contest not found" };
    return { success: true, data: contest };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.deleteContest = async (contestId) => {
  try {
    const contest = await Contest.findByIdAndDelete(contestId);
    if (!contest) return { success: false, message: "Contest not found" };
    return { success: true, message: "Contest deleted successfully" };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.getContestAnalytics = async (contestId) => {
  try {
    const contest = await Contest.findById(contestId);
    if (!contest) return { success: false, message: "Contest not found" };

    // Get number of participants by counting unique users who earned points in this period/region
    let userQuery = {};
    if (contest.region && contest.region !== "ALL") {
      userQuery.areaOfOperation = contest.region;
    }
    const eligibleUsers = await User.find(userQuery).select("_id");
    const eligibleUserIds = eligibleUsers.map((u) => u._id);

    const participantCountResult = await LoyaltyTransaction.aggregate([
      {
        $match: {
          type: LOYALTY_TRANSACTION_TYPES.ADDITION,
          createdAt: { $gte: contest.startDate, $lte: contest.endDate },
          userId: { $in: eligibleUserIds },
        },
      },
      {
        $group: {
          _id: "$userId",
        },
      },
      {
        $count: "totalParticipants",
      },
    ]);

    const participantCount = participantCountResult[0] ? participantCountResult[0].totalParticipants : 0;

    return {
      success: true,
      data: {
        participantCount,
        winnersFinalized: contest.winnersFinalized,
        winnersCount: contest.winners.length,
      },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// Internal function to calculate leaderboard
const getLeaderboardRaw = async (contestId) => {
  const contest = await Contest.findById(contestId);
  if (!contest) throw new Error("Contest not found");

  let userQuery = {};
  if (contest.region && contest.region !== "ALL") {
    userQuery.areaOfOperation = contest.region;
  }
  const eligibleUsers = await User.find(userQuery).select("_id name profilePhoto");
  const eligibleUserIds = eligibleUsers.map((u) => u._id);

  const leaderboardAgg = await LoyaltyTransaction.aggregate([
    {
      $match: {
        type: LOYALTY_TRANSACTION_TYPES.ADDITION,
        createdAt: { $gte: contest.startDate, $lte: contest.endDate },
        userId: { $in: eligibleUserIds },
      },
    },
    {
      $group: {
        _id: "$userId",
        totalPoints: { $sum: "$points" },
      },
    },
    {
      $sort: { totalPoints: -1 },
    },
  ]);

  // Map user info to leaderboard
  const userMap = eligibleUsers.reduce((acc, u) => {
    acc[u._id.toString()] = { name: u.name, profilePhoto: u.profilePhoto };
    return acc;
  }, {});

  const leaderboard = leaderboardAgg.map((entry, index) => ({
    userId: entry._id,
    name: userMap[entry._id.toString()]?.name || "Unknown User",
    profilePhoto: userMap[entry._id.toString()]?.profilePhoto || null,
    points: entry.totalPoints,
    rank: index + 1,
  }));

  return { contest, leaderboard };
};

exports.calculateLeaderboard = async (contestId, requestingUserId = null) => {
  try {
    const { contest, leaderboard } = await getLeaderboardRaw(contestId);

    // Limit to top 10 for standard view
    const top10 = leaderboard.slice(0, 10);
    
    let userRank = null;
    if (requestingUserId) {
      userRank = leaderboard.find((l) => l.userId.toString() === requestingUserId.toString()) || null;
      if (!userRank && contest.region !== "ALL") {
        // Check if user is even eligible
        const user = await User.findById(requestingUserId).select("areaOfOperation");
        if (user && user.areaOfOperation === contest.region) {
          userRank = { userId: requestingUserId, points: 0, rank: "N/A" };
        }
      } else if (!userRank) {
        userRank = { userId: requestingUserId, points: 0, rank: "N/A" };
      }
    }

    return {
      success: true,
      data: {
        contestName: contest.name,
        region: contest.region,
        status: contest.winnersFinalized ? "COMPLETED" : "ACTIVE/UPCOMING",
        top10,
        userRank,
      },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.finalizeContestWinners = async (contestId) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const { contest, leaderboard } = await getLeaderboardRaw(contestId);
      if (contest.winnersFinalized) {
        throw new Error("Winners already finalized");
      }

      const winners = [];
      
      // For each user in leaderboard, check if they fall into a prize bracket
      for (const entry of leaderboard) {
        const rank = entry.rank;
        const prize = contest.prizeStructure.find((p) => rank >= p.rankStart && rank <= p.rankEnd);
        
        if (prize) {
          const winnerData = {
            userId: entry.userId,
            rank: entry.rank,
            rewardType: prize.rewardType,
          };

          if (prize.rewardType === "POINTS") {
            winnerData.pointsAmount = prize.points;
            
            // Add points to user
            await User.findByIdAndUpdate(
              entry.userId,
              { $inc: { totalPoints: prize.points } },
              { session }
            );

            // Record transaction
            const loyaltyTx = new LoyaltyTransaction({
              userId: entry.userId,
              points: prize.points,
              type: LOYALTY_TRANSACTION_TYPES.ADDITION,
              source: "ADMIN_ADJUSTMENT", // or CONTEST_REWARD
              description: `Reward for ranking #${rank} in contest: ${contest.name}`,
              referenceId: contest._id
            });
            await loyaltyTx.save({ session });

          } else if (prize.rewardType === "GIFT" && prize.giftId) {
            winnerData.giftId = prize.giftId;
            
            // Process gift redemption
            const gift = await Gift.findById(prize.giftId).session(session);
            if (gift) {
              const redemption = new GiftRedemption({
                userId: entry.userId,
                giftId: prize.giftId,
                coinsUsed: 0,
                status: "Approved",
                shippingAddress: null
              });
              await redemption.save({ session });
              winnerData.giftRedemptionId = redemption._id;

              if (gift.stockQuantity > 0) {
                 gift.stockQuantity -= 1;
                 await gift.save({ session });
              }
            }
          }

          winners.push(winnerData);
        }
      }

      contest.winners = winners;
      contest.winnersFinalized = true;
      await contest.save({ session });
      result = contest;
    });

    // Send push notification to winners outside the transaction
    if (result && result.winners && result.winners.length > 0) {
      for (const winner of result.winners) {
        const userToNotify = await User.findById(winner.userId);
        if (userToNotify?.fcmTokens?.length && userToNotify?.enableNotification) {
          let rewardText = "";
          if (winner.rewardType === "POINTS") {
            rewardText = `${winner.pointsAmount} Bonus Points`;
          } else if (winner.rewardType === "GIFT") {
            const gift = await Gift.findById(winner.giftId);
            rewardText = gift ? gift.name : "a Special Gift";
          }
          
          await sendFcmNotifications(
            userToNotify.fcmTokens,
            APP_NOTIFICATIONS.contests.winner.title,
            formatNotification(APP_NOTIFICATIONS.contests.winner.body, { 
              rank: winner.rank, 
              contestName: result.name, 
              rewardText 
            })
          );
        }
      }
    }

    return { success: true, message: "Winners finalized successfully", data: result };
  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    await session.endSession();
  }
};

// User Functions

exports.listUserContests = async (userId, data) => {
  try {
    const { page = 1, limit = 10, status } = data;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId).select("areaOfOperation");
    if (!user) return { success: false, message: "User not found" };

    const region = user.areaOfOperation || "";

    let query = {
      isActive: true,
      $or: [{ region: "ALL" }, { region: region }]
    };

    const now = new Date();
    if (status === "ACTIVE") {
      query.startDate = { $lte: now };
      query.endDate = { $gte: now };
    } else if (status === "UPCOMING") {
      query.startDate = { $gt: now };
    } else if (status === "COMPLETED") {
      query.endDate = { $lt: now };
    }

    const contests = await Contest.find(query)
      .populate("prizeStructure.giftId", "name image")
      .skip(skip)
      .limit(limit)
      .sort({ endDate: 1 }); // usually want ending soonest first

    const total = await Contest.countDocuments(query);
    return {
      success: true,
      data: {
        records: contests,
        total,
        totalPages: Math.ceil(total / limit),
        page,
        limit,
      },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

const contestsService = require("../contests.service");
const { Contest } = require("../../../schemas/contest.schema");
const { ContestEntry } = require("../../../schemas/contest-entry.schema");
const User = require("../../../schemas/user.schema");
const ContestTransaction = require("../../../schemas/contest-transaction.schema");
const { RuleSet } = require("../../../schemas/rule-set.schema");
const GiftRedemption = require("../../../schemas/gift-redemption.schema");
const { evaluateRuleSet } = require("../../rule-set/rule-set.evaluator");
const {
  CONTEST_STATUS,
  REWARD_TYPE,
  ENTRY_REWARD_STATUS,
  CONTEST_MESSAGES,
  CONTEST_ERRORS,
  CONTEST_METRICS,
} = require("../../../constants/contests");

jest.mock("../../../schemas/contest.schema");
jest.mock("../../../schemas/contest-entry.schema");
jest.mock("../../../schemas/user.schema");
jest.mock("../../../schemas/contest-transaction.schema");
jest.mock("../../../schemas/rule-set.schema");
jest.mock("../../../schemas/gift-redemption.schema");
jest.mock("../../rule-set/rule-set.evaluator", () => ({
  evaluateRuleSet: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../../functions/fcm", () => ({
  sendFcmNotifications: jest.fn().mockResolvedValue({ successCount: 1 }),
}));
jest.mock("mongoose", () => {
  const actualMongoose = jest.requireActual("mongoose");
  return {
    ...actualMongoose,
    startSession: jest.fn().mockResolvedValue({
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    }),
  };
});

describe("Contests Service Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("adminCreateContest", () => {
    it("should create an upcoming contest if start date is in the future", async () => {
      const futureStart = new Date(Date.now() + 86400000).toISOString();
      const futureEnd = new Date(Date.now() + 172800000).toISOString();
      const mockCreated = { _id: "c1" };
      Contest.create.mockResolvedValue(mockCreated);

      const result = await contestsService.adminCreateContest(
        {
          name: "Future Contest",
          startDate: futureStart,
          endDate: futureEnd,
        },
        "admin1",
      );

      expect(Contest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Future Contest",
          status: CONTEST_STATUS.UPCOMING,
          createdBy: "admin1",
        }),
      );
      expect(result.message).toBe(CONTEST_MESSAGES.CREATED);
      expect(result.data.contestId).toBe("c1");
    });
  });

  describe("adminUpdateContest", () => {
    it("should throw 404 error if contest is not found", async () => {
      Contest.findById.mockResolvedValue(null);

      await expect(
        contestsService.adminUpdateContest("invalidId", { name: "New Name" }),
      ).rejects.toThrow(CONTEST_ERRORS.CONTEST_NOT_FOUND);
    });

    it("should update contest when found", async () => {
      const mockContest = {
        _id: "c1",
        name: "Old Name",
        startDate: new Date(),
        endDate: new Date(),
        save: jest.fn().mockResolvedValue(true),
      };
      Contest.findById.mockResolvedValue(mockContest);

      const result = await contestsService.adminUpdateContest("c1", {
        name: "New Name",
      });

      expect(mockContest.name).toBe("New Name");
      expect(mockContest.save).toHaveBeenCalled();
      expect(result.message).toBe(CONTEST_MESSAGES.UPDATED);
    });
  });

  describe("adminDeleteContest", () => {
    it("should delete contest by id", async () => {
      Contest.findByIdAndDelete.mockResolvedValue(true);

      const result = await contestsService.adminDeleteContest("c1");

      expect(Contest.findByIdAndDelete).toHaveBeenCalledWith("c1");
      expect(result.message).toBe(CONTEST_MESSAGES.DELETED);
    });
  });

  describe("adminListContests", () => {
    it("should return paginated contests list with parsed limit and page", async () => {
      const mockContests = [{ _id: "c1", name: "Contest 1" }];
      const queryChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockContests),
      };
      Contest.find.mockReturnValue(queryChain);
      Contest.countDocuments.mockResolvedValue(1);

      const result = await contestsService.adminListContests({
        page: "2",
        limit: "10",
      });

      expect(queryChain.skip).toHaveBeenCalledWith(10);
      expect(queryChain.limit).toHaveBeenCalledWith(10);
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
      expect(result.data.total).toBe(1);
    });
  });

  describe("adminGetContestDetails", () => {
    it("should throw 404 error if contest is not found", async () => {
      const queryChain = {
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      };
      Contest.findById.mockReturnValue(queryChain);

      await expect(
        contestsService.adminGetContestDetails("invalidId"),
      ).rejects.toThrow(CONTEST_ERRORS.CONTEST_NOT_FOUND);
    });
  });

  describe("userClaimReward", () => {
    it("should throw 404 if entry not found", async () => {
      ContestEntry.findOne.mockResolvedValue(null);

      await expect(contestsService.userClaimReward("c1", "u1")).rejects.toThrow(
        CONTEST_ERRORS.ENTRY_NOT_FOUND,
      );
    });

    it("should throw 400 if contest is not completed", async () => {
      const mockEntry = { _id: "e1", contestId: "c1", userId: "u1" };
      ContestEntry.findOne.mockResolvedValue(mockEntry);

      const mockContest = {
        _id: "c1",
        startDate: new Date(Date.now() - 10000),
        endDate: new Date(Date.now() + 100000), // active
      };
      Contest.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockContest),
      });

      await expect(contestsService.userClaimReward("c1", "u1")).rejects.toThrow(
        CONTEST_ERRORS.NOT_COMPLETED,
      );
    });

    it("should claim points reward successfully when contest is completed", async () => {
      const mockEntry = {
        _id: "e1",
        contestId: "c1",
        userId: "u1",
        rank: 1,
        rewardStatus: ENTRY_REWARD_STATUS.PENDING,
        save: jest.fn().mockResolvedValue(true),
      };
      ContestEntry.findOne.mockResolvedValue(mockEntry);

      const mockContest = {
        _id: "c1",
        startDate: new Date(Date.now() - 200000),
        endDate: new Date(Date.now() - 100000), // completed
        prizes: [{ rank: 1, rewardType: REWARD_TYPE.POINTS, points: 500 }],
      };
      Contest.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockContest),
      });

      const mockUser = {
        _id: "u1",
        totalPoints: 100,
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);
      User.findByIdAndUpdate.mockImplementation((id, update) => {
        if (update?.$inc?.totalPoints)
          mockUser.totalPoints += update.$inc.totalPoints;
        return Promise.resolve(mockUser);
      });

      const result = await contestsService.userClaimReward("c1", "u1");

      expect(mockUser.totalPoints).toBe(600);
      expect(mockEntry.rewardStatus).toBe(ENTRY_REWARD_STATUS.CREDITED);
      expect(result.data.message).toBe(CONTEST_MESSAGES.REWARD_CLAIMED);
    });
  });

  describe("syncUserContestEntries", () => {
    it("should process scan count metric correctly", async () => {
      const mockContests = [
        {
          _id: "c1",
          metric: CONTEST_METRICS.SCAN_COUNT,
          ruleSetId: "rs1",
        },
      ];
      Contest.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockContests),
      });

      User.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "u1" }),
      });

      RuleSet.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "rs1" }),
      });

      evaluateRuleSet.mockResolvedValue(true);
      ContestTransaction.create.mockResolvedValue({ _id: "t1" });
      ContestEntry.findOneAndUpdate.mockResolvedValue({ _id: "e1" });

      await contestsService.syncUserContestEntries(
        "u1",
        50, // points awarded
        "prod1",
        "tier1",
        "txn1",
      );

      // Verify transaction was recorded with metricValue = 1 (for SCAN_COUNT)
      expect(ContestTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          contestId: "c1",
          userId: "u1",
          transactionId: "txn1",
          metric: CONTEST_METRICS.SCAN_COUNT,
          metricValue: 1,
        }),
      );

      // Verify ContestEntry points incremented by 1
      expect(ContestEntry.findOneAndUpdate).toHaveBeenCalledWith(
        { contestId: "c1", userId: "u1" },
        { $inc: { qualificationPoints: 1 } },
        { upsert: true, new: true },
      );
    });

    it("should process points metric correctly", async () => {
      const mockContests = [
        {
          _id: "c2",
          metric: CONTEST_METRICS.POINTS,
          ruleSetId: null,
        },
      ];
      Contest.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockContests),
      });

      User.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "u1" }),
      });

      ContestTransaction.create.mockResolvedValue({ _id: "t1" });

      await contestsService.syncUserContestEntries(
        "u1",
        150, // points awarded
        "prod1",
        "tier1",
        "txn2",
      );

      // Verify transaction recorded with metricValue = 150
      expect(ContestTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metricValue: 150,
        }),
      );

      // Verify ContestEntry points incremented by 150
      expect(ContestEntry.findOneAndUpdate).toHaveBeenCalledWith(
        { contestId: "c2", userId: "u1" },
        { $inc: { qualificationPoints: 150 } },
        { upsert: true, new: true },
      );
    });

    it("should skip ContestEntry update if duplicate transaction occurs", async () => {
      const mockContests = [{ _id: "c1", metric: CONTEST_METRICS.POINTS }];
      Contest.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockContests),
      });
      User.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "u1" }),
      });

      const duplicateError = new Error("Duplicate");
      duplicateError.code = 11000;
      ContestTransaction.create.mockRejectedValue(duplicateError);

      await contestsService.syncUserContestEntries(
        "u1",
        50,
        "prod1",
        "tier1",
        "txn3",
      );

      // Because transaction threw duplicate error, findOneAndUpdate should NOT be called
      expect(ContestEntry.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe("adminFinaliseContest", () => {
    it("should throw error if contest is not ongoing", async () => {
      Contest.findById.mockResolvedValue({
        _id: "c1",
        status: CONTEST_STATUS.COMPLETED,
      });

      await expect(
        contestsService.adminFinaliseContest("c1", "admin1"),
      ).rejects.toThrow("Only ongoing contests can be finalised");
    });

    it("should finalize contest and award points correctly", async () => {
      const mockContest = {
        _id: "c1",
        status: CONTEST_STATUS.ONGOING,
        prizes: [{ rank: 1, rewardType: REWARD_TYPE.POINTS, points: 500 }],
        save: jest.fn().mockResolvedValue(true),
      };
      Contest.findById.mockResolvedValue(mockContest);

      const mockUser = {
        _id: "u1",
        totalPoints: 100,
        enableNotification: true,
        fcmTokens: ["token1"],
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });
      User.findByIdAndUpdate.mockImplementation((id, update) => {
        if (update?.$inc?.totalPoints)
          mockUser.totalPoints += update.$inc.totalPoints;
        return Promise.resolve(mockUser);
      });

      const mockEntry = {
        _id: "e1",
        userId: "u1",
        qualificationPoints: 1000,
        user: mockUser,
        save: jest.fn().mockResolvedValue(true),
      };

      const queryChain = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        session: jest.fn().mockResolvedValue([mockEntry]),
      };
      ContestEntry.find.mockReturnValue(queryChain);

      const result = await contestsService.adminFinaliseContest("c1", "admin1");

      expect(mockContest.status).toBe(CONTEST_STATUS.COMPLETED);
      expect(mockContest.isFinalizedManually).toBe(true);
      expect(mockContest.finalizedBy).toBe("admin1");
      expect(mockContest.save).toHaveBeenCalled();

      // Ensure user received bonus points
      expect(mockUser.totalPoints).toBe(600);
      expect(User.findByIdAndUpdate).toHaveBeenCalled();

      // Ensure entry was updated
      expect(mockEntry.rank).toBe(1);
      expect(mockEntry.rewardType).toBe(REWARD_TYPE.POINTS);
      expect(mockEntry.bonusPointsAwarded).toBe(500);
      expect(mockEntry.save).toHaveBeenCalled();

      expect(result.message).toBe(CONTEST_MESSAGES.FINALISED);
    });
  });
});

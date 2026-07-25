const contestsService = require("../contests.service");
const { Contest } = require("../../../schemas/contest.schema");
const { ContestEntry } = require("../../../schemas/contest-entry.schema");
const User = require("../../../schemas/user.schema");
const {
  CONTEST_STATUS,
  REWARD_TYPE,
  ENTRY_REWARD_STATUS,
  CONTEST_MESSAGES,
  CONTEST_ERRORS,
} = require("../../../constants/contests");

jest.mock("../../../schemas/contest.schema");
jest.mock("../../../schemas/contest-entry.schema");
jest.mock("../../../schemas/user.schema");
jest.mock("../../../functions/fcm", () => ({
  sendFcmNotifications: jest.fn().mockResolvedValue({ successCount: 1 }),
}));

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

      const result = await contestsService.userClaimReward("c1", "u1");

      expect(mockUser.totalPoints).toBe(600);
      expect(mockEntry.rewardStatus).toBe(ENTRY_REWARD_STATUS.CREDITED);
      expect(result.data.message).toBe(CONTEST_MESSAGES.REWARD_CLAIMED);
    });
  });
});

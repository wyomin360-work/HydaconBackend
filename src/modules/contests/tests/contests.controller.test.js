const contestsController = require("../contests.controller");
const contestsService = require("../contests.service");

jest.mock("../contests.service");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("Contests Controller Unit Tests", () => {
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    res = mockRes();
  });

  describe("Admin Controller Actions", () => {
    it("adminCreateContest should delegate to contestsService.adminCreateContest", async () => {
      const req = {
        body: { name: "Summer Contest" },
        admin: { _id: "admin1" },
      };
      contestsService.adminCreateContest.mockResolvedValue({
        message: "Contest created",
        data: { contestId: "c1" },
      });

      await contestsController.adminCreateContest(req, res);

      expect(contestsService.adminCreateContest).toHaveBeenCalledWith(
        { name: "Summer Contest" },
        "admin1",
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "success" }),
      );
    });

    it("adminUpdateContest should delegate to contestsService.adminUpdateContest", async () => {
      const req = {
        params: { contestId: "c1" },
        body: { name: "Updated Name" },
      };
      contestsService.adminUpdateContest.mockResolvedValue({
        message: "Contest updated",
        data: { updated: true },
      });

      await contestsController.adminUpdateContest(req, res);

      expect(contestsService.adminUpdateContest).toHaveBeenCalledWith("c1", {
        name: "Updated Name",
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("adminDeleteContest should delegate to contestsService.adminDeleteContest", async () => {
      const req = { params: { contestId: "c1" } };
      contestsService.adminDeleteContest.mockResolvedValue({
        message: "Contest deleted",
        data: { deleted: true },
      });

      await contestsController.adminDeleteContest(req, res);

      expect(contestsService.adminDeleteContest).toHaveBeenCalledWith("c1");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("adminListContests should delegate to contestsService.adminListContests", async () => {
      const req = { query: { page: "1", limit: "10" } };
      contestsService.adminListContests.mockResolvedValue({
        data: { contests: [], page: 1, limit: 10, total: 0 },
      });

      await contestsController.adminListContests(req, res);

      expect(contestsService.adminListContests).toHaveBeenCalledWith({
        page: "1",
        limit: "10",
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("adminGetContestDetails should delegate to contestsService.adminGetContestDetails", async () => {
      const req = { params: { contestId: "c1" } };
      contestsService.adminGetContestDetails.mockResolvedValue({
        data: { _id: "c1", name: "Summer Contest" },
      });

      await contestsController.adminGetContestDetails(req, res);

      expect(contestsService.adminGetContestDetails).toHaveBeenCalledWith("c1");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("adminFinaliseContest should delegate to contestsService.adminFinaliseContest", async () => {
      const req = { params: { contestId: "c1" } };
      contestsService.adminFinaliseContest.mockResolvedValue({
        message: "Contest finalised",
        data: { ranked: 5 },
      });

      await contestsController.adminFinaliseContest(req, res);

      expect(contestsService.adminFinaliseContest).toHaveBeenCalledWith(
        "c1",
        undefined,
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("User Controller Actions", () => {
    it("userListContests should pass query and userId to service", async () => {
      const req = { query: { page: "1" }, user: { _id: "u1" } };
      contestsService.userListContests.mockResolvedValue({
        data: { contests: [] },
      });

      await contestsController.userListContests(req, res);

      expect(contestsService.userListContests).toHaveBeenCalledWith(
        { page: "1" },
        "u1",
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("userGetContestDetails should pass contestId and userId to service", async () => {
      const req = { params: { contestId: "c1" }, user: { _id: "u1" } };
      contestsService.userGetContestDetails.mockResolvedValue({
        data: { contest: {} },
      });

      await contestsController.userGetContestDetails(req, res);

      expect(contestsService.userGetContestDetails).toHaveBeenCalledWith(
        "c1",
        "u1",
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("userGetLeaderboard should pass contestId to service", async () => {
      const req = { params: { contestId: "c1" } };
      contestsService.userGetLeaderboard.mockResolvedValue({
        data: { leaderboard: [] },
      });

      await contestsController.userGetLeaderboard(req, res);

      expect(contestsService.userGetLeaderboard).toHaveBeenCalledWith("c1");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("generalLeaderboard should pass userId to service", async () => {
      const req = { user: { _id: "u1" } };
      contestsService.generalLeaderboard.mockResolvedValue({
        data: { leaderboard: [] },
      });

      await contestsController.generalLeaderboard(req, res);

      expect(contestsService.generalLeaderboard).toHaveBeenCalledWith("u1");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("userClaimReward should pass contestId and userId to service", async () => {
      const req = { params: { contestId: "c1" }, user: { _id: "u1" } };
      contestsService.userClaimReward.mockResolvedValue({
        data: { message: "Reward claimed" },
      });

      await contestsController.userClaimReward(req, res);

      expect(contestsService.userClaimReward).toHaveBeenCalledWith("c1", "u1");
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});

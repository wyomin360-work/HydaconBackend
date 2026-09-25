const rewardsService = require("../rewards.service");
const Reward = require("../../../schemas/reward.schema");
const Product = require("../../../schemas/product.schema");
const AppError = require("../../../utils/appError");

jest.mock("../../../schemas/reward.schema");
jest.mock("../../../schemas/product.schema");
jest.mock("../../../schemas/gift.schema");
jest.mock("../../../schemas/user.schema");
jest.mock("../../gift/gift.service");
jest.mock("../../loyalty/loyalty.service");

describe("Rewards Service - Bulk Update Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("bulkUpdateRewards", () => {
    it("should bulk update active rewards with points and expiry date", async () => {
      const rewardIds = [
        "64a1b2c3d4e5f67890123456",
        "64a1b2c3d4e5f67890123457",
      ];
      const updateData = {
        rewardIds,
        rewardPoints: 150,
        expiresAt: "2026-12-31T23:59:59.000Z",
      };

      Reward.updateMany.mockResolvedValue({
        matchedCount: 2,
        modifiedCount: 2,
      });

      const response = await rewardsService.bulkUpdateRewards(updateData);

      expect(Reward.updateMany).toHaveBeenCalledWith(
        {
          _id: { $in: rewardIds },
          active: { $ne: false },
        },
        {
          $set: {
            point: 150,
            expiresAt: new Date("2026-12-31T23:59:59.000Z"),
          },
        },
      );

      expect(response).toEqual({
        message: "rewards updated",
        data: {
          matchedCount: 2,
          modifiedCount: 2,
          rewardsUpdated: true,
        },
      });
    });

    it("should bulk update only points if expiresAt is not provided", async () => {
      const rewardIds = ["64a1b2c3d4e5f67890123456"];
      const updateData = {
        rewardIds,
        rewardPoints: 200,
      };

      Reward.updateMany.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      const response = await rewardsService.bulkUpdateRewards(updateData);

      expect(Reward.updateMany).toHaveBeenCalledWith(
        {
          _id: { $in: rewardIds },
          active: { $ne: false },
        },
        {
          $set: {
            point: 200,
          },
        },
      );

      expect(response.data.rewardsUpdated).toBe(true);
    });

    it("should bulk update only expiresAt if rewardPoints is not provided", async () => {
      const rewardIds = ["64a1b2c3d4e5f67890123456"];
      const updateData = {
        rewardIds,
        expiresAt: "2027-01-01T00:00:00.000Z",
      };

      Reward.updateMany.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      const response = await rewardsService.bulkUpdateRewards(updateData);

      expect(Reward.updateMany).toHaveBeenCalledWith(
        {
          _id: { $in: rewardIds },
          active: { $ne: false },
        },
        {
          $set: {
            expiresAt: new Date("2027-01-01T00:00:00.000Z"),
          },
        },
      );

      expect(response.data.rewardsUpdated).toBe(true);
    });

    it("should throw error if no update fields are provided", async () => {
      const rewardIds = ["64a1b2c3d4e5f67890123456"];
      const updateData = {
        rewardIds,
      };

      await expect(
        rewardsService.bulkUpdateRewards(updateData),
      ).rejects.toThrow(AppError);
    });
  });

  describe("batchUpdateRewards", () => {
    it("should find rewards matching date and productId and update them", async () => {
      const productId = "64a1b2c3d4e5f67890123456";
      const createdDate = "2026-09-25";
      const batchData = {
        productId,
        createdDate,
        rewardPoints: 300,
        expiresAt: "2026-12-31T23:59:59.000Z",
      };

      Reward.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: "64a1b2c3d4e5f67890123456" },
          { _id: "64a1b2c3d4e5f67890123457" },
        ]),
      });

      Reward.updateMany.mockResolvedValue({
        matchedCount: 2,
        modifiedCount: 2,
      });

      const response = await rewardsService.batchUpdateRewards(batchData);

      expect(Reward.find).toHaveBeenCalled();
      expect(Reward.updateMany).toHaveBeenCalledWith(
        {
          _id: {
            $in: ["64a1b2c3d4e5f67890123456", "64a1b2c3d4e5f67890123457"],
          },
          active: { $ne: false },
        },
        {
          $set: {
            point: 300,
            expiresAt: new Date("2026-12-31T23:59:59.000Z"),
          },
        },
      );

      expect(response).toEqual({
        message: "rewards updated",
        data: {
          matchedCount: 2,
          modifiedCount: 2,
          rewardsUpdated: true,
        },
      });
    });

    it("should return message if no active rewards found for the batch", async () => {
      const productId = "64a1b2c3d4e5f67890123456";
      const createdDate = "2026-09-25";
      const batchData = {
        productId,
        createdDate,
        rewardPoints: 300,
      };

      Reward.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });

      const response = await rewardsService.batchUpdateRewards(batchData);

      expect(response).toEqual({
        message: "no active rewards found for the specified batch",
        data: {
          matchedCount: 0,
          modifiedCount: 0,
          rewardsUpdated: false,
        },
      });
      expect(Reward.updateMany).not.toHaveBeenCalled();
    });
  });
});

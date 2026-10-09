const mongoose = require("mongoose");
const rewardsService = require("../rewards.service");
const Reward = require("../../../schemas/reward.schema");
const RewardBatch = require("../../../schemas/reward-batch.schema");
const Product = require("../../../schemas/product.schema");
const AppError = require("../../../utils/appError");
const validateRequest = require("../../../middlewares/validator");
const {
  createRewardRequestType,
  listRewardRequestType,
} = require("../../../validations/rewards.validations");
const { MAX_REWARD_BATCH_SIZE } = require("../../../constants/rewards");

jest.mock("../../../schemas/reward.schema");
jest.mock("../../../schemas/reward-batch.schema");
jest.mock("../../../schemas/product.schema");
jest.mock("../../../schemas/gift.schema");
jest.mock("../../../schemas/user.schema");
jest.mock("../../gift/gift.service");
jest.mock("../../loyalty/loyalty.service");

describe("Reward batches", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows a creation count of 10,000 and rejects 10,001 in request validation", () => {
    const middleware = validateRequest(createRewardRequestType);
    const validNext = jest.fn();
    const invalidNext = jest.fn();
    const request = (count) => ({
      body: {
        expiresAt: "2027-01-01T00:00:00.000Z",
        productId: "64a1b2c3d4e5f67890123456",
        count,
      },
    });

    middleware(request(MAX_REWARD_BATCH_SIZE), null, validNext);
    middleware(request(MAX_REWARD_BATCH_SIZE + 1), null, invalidNext);

    expect(validNext).toHaveBeenCalledWith();
    expect(invalidNext).toHaveBeenCalledWith(expect.any(AppError));
    expect(invalidNext.mock.calls[0][0].statusCode).toBe(400);
    expect(invalidNext.mock.calls[0][0].message).toContain(
      "For a single batch, a maximum of 10,000 rewards is allowed to create.",
    );
  });

  it("accepts batchId in the reward list API and scopes the query to that batch", async () => {
    const batchId = "64a1b2c3d4e5f67890123457";
    const middleware = validateRequest(listRewardRequestType);
    const next = jest.fn();
    middleware({ body: { page: 1, limit: 10, batchId } }, null, next);
    expect(next).toHaveBeenCalledWith();

    const query = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          productId: new mongoose.Types.ObjectId(),
          batchId: {
            _id: new mongoose.Types.ObjectId(batchId),
            batchUid: "REG_01",
            batchNumber: 1,
            createdAt: new Date("2026-10-09T00:00:00.000Z"),
          },
        },
      ]),
    };
    Reward.find.mockReturnValue(query);
    Reward.countDocuments.mockResolvedValue(1);

    const response = await rewardsService.listRewards({
      page: 1,
      limit: 10,
      batchId,
    });

    expect(Reward.find).toHaveBeenCalledWith({
      isDeleted: { $ne: true },
      batchId: new mongoose.Types.ObjectId(batchId),
    });
    expect(query.populate).toHaveBeenCalledWith(
      "batchId",
      "batchUid batchNumber createdAt",
    );
    expect(response.data.rewards[0]).toMatchObject({
      batchId: new mongoose.Types.ObjectId(batchId),
      batchUid: "REG_01",
      batchNumber: 1,
      batchCreatedAt: new Date("2026-10-09T00:00:00.000Z"),
    });
  });

  it("creates one batch and assigns its ID to every reward in the request", async () => {
    const batchId = "64a1b2c3d4e5f67890123457";
    const productId = "64a1b2c3d4e5f67890123456";
    Product.findById.mockReturnValue({
      lean: jest
        .fn()
        .mockResolvedValue({ name: "Regular 501 Grey", rewardPoints: 25 }),
    });
    Product.findByIdAndUpdate.mockReturnValue({
      lean: jest
        .fn()
        .mockResolvedValue({
          name: "Regular 501 Grey",
          rewardBatchSequence: 1,
        }),
    });
    RewardBatch.create.mockResolvedValue({ _id: batchId });
    Reward.insertMany.mockResolvedValue([]);
    RewardBatch.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const response = await rewardsService.createRewards({
      productId,
      expiresAt: "2027-01-01T00:00:00.000Z",
      count: 3,
    });

    expect(RewardBatch.create).toHaveBeenCalledWith({
      batchUid: "REG_01",
      batchNumber: 1,
      productId,
      totalCount: 3,
      activeCount: 3,
      inactiveCount: 0,
      status: "creating",
    });
    const insertedRewards = Reward.insertMany.mock.calls[0][0];
    expect(insertedRewards).toHaveLength(3);
    expect(insertedRewards.every((reward) => reward.batchId === batchId)).toBe(
      true,
    );
    expect(RewardBatch.updateOne).toHaveBeenCalledWith(
      { _id: batchId },
      { $set: { status: "complete" } },
    );
    expect(response.data).toEqual({
      rewardsAdded: true,
      batchId,
      batchUid: "REG_01",
      totalCount: 3,
    });
  });

  it("lists stored batch counts without aggregating the reward collection", async () => {
    const productId = "64a1b2c3d4e5f67890123456";
    const batch = {
      _id: "64a1b2c3d4e5f67890123457",
      productId: { _id: productId, name: "Regular 501 Grey" },
      activeCount: 7,
      inactiveCount: 3,
      totalCount: 10,
      status: "complete",
    };
    const query = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([batch]),
    };
    RewardBatch.find.mockReturnValue(query);
    RewardBatch.countDocuments.mockResolvedValue(1);

    const response = await rewardsService.listRewardBatches({
      page: 1,
      limit: 10,
      search: "reg",
      activityStatus: "inactive",
      startDate: "2026-10-01",
      endDate: "2026-10-09",
    });

    expect(Reward.aggregate).not.toHaveBeenCalled();
    expect(response.data.batches[0]).toMatchObject({
      productId,
      product: { name: "Regular 501 Grey" },
      activeCount: 7,
      inactiveCount: 3,
      totalCount: 10,
    });
    expect(RewardBatch.countDocuments).toHaveBeenCalledWith({
      isDeleted: { $ne: true },
      status: "complete",
      batchUid: { $regex: "^REG" },
      inactiveCount: { $gt: 0 },
      createdAt: {
        $gte: new Date("2026-10-01"),
        $lte: new Date("2026-10-09T23:59:59.999Z"),
      },
    });
  });

  it("rejects counts above the limit in the service even if validation is bypassed", async () => {
    await expect(
      rewardsService.createRewards({
        productId: "64a1b2c3d4e5f67890123456",
        expiresAt: "2027-01-01T00:00:00.000Z",
        count: MAX_REWARD_BATCH_SIZE + 1,
      }),
    ).rejects.toThrow(AppError);

    expect(Product.findById).not.toHaveBeenCalled();
    expect(RewardBatch.create).not.toHaveBeenCalled();
  });

  it("changes active and inactive batch counts transactionally when reward status changes", async () => {
    const batchId = "64a1b2c3d4e5f67890123457";
    const rewardId = "64a1b2c3d4e5f67890123458";
    const session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn(),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    const rewardQuery = {
      session: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue({ _id: rewardId, batchId, active: true }),
    };
    Reward.findById.mockReturnValue(rewardQuery);
    Reward.findByIdAndUpdate.mockResolvedValue({ _id: rewardId });
    RewardBatch.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await rewardsService.updateReward(
      { active: false, rewardPoints: 10 },
      rewardId,
    );

    expect(RewardBatch.updateOne).toHaveBeenCalledWith(
      { _id: batchId },
      { $inc: { activeCount: -1, inactiveCount: 1 } },
      { session },
    );
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it("moves one count back to active when an inactive reward is reactivated", async () => {
    const batchId = "64a1b2c3d4e5f67890123457";
    const rewardId = "64a1b2c3d4e5f67890123458";
    const session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn(),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    Reward.findById.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue({ _id: rewardId, batchId, active: false }),
    });
    Reward.findByIdAndUpdate.mockResolvedValue({ _id: rewardId });
    RewardBatch.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await rewardsService.updateReward(
      { active: true, rewardPoints: 10 },
      rewardId,
    );

    expect(RewardBatch.updateOne).toHaveBeenCalledWith(
      { _id: batchId },
      { $inc: { activeCount: 1, inactiveCount: -1 } },
      { session },
    );
  });

  it("deactivates active QR codes in a batch and moves their stored counts", async () => {
    const batchId = "64a1b2c3d4e5f67890123457";
    const session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn(),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    RewardBatch.findOne.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: batchId, isDeleted: false }),
    });
    Reward.updateMany.mockResolvedValue({ matchedCount: 4 });
    RewardBatch.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const response = await rewardsService.deactivateRewardBatch(batchId);

    expect(Reward.updateMany).toHaveBeenCalledWith(
      { batchId, active: { $ne: false }, isDeleted: { $ne: true } },
      { $set: { active: false } },
      { session },
    );
    expect(RewardBatch.updateOne).toHaveBeenCalledWith(
      { _id: batchId },
      { $inc: { activeCount: -4, inactiveCount: 4 } },
      { session },
    );
    expect(response.data.deactivatedCount).toBe(4);
  });

  it("updates unscanned rewards only and rejects an expiry date in the past", async () => {
    const batchId = "64a1b2c3d4e5f67890123457";
    RewardBatch.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: batchId, totalCount: 5 }),
    });
    Reward.updateMany.mockResolvedValue({ matchedCount: 4, modifiedCount: 4 });

    const response = await rewardsService.updateRewardBatch(batchId, {
      expiresAt: "2099-01-01T00:00:00.000Z",
      rewardPoints: 90,
    });

    expect(Reward.updateMany).toHaveBeenCalledWith(
      { batchId, isRedeemed: { $ne: true }, isDeleted: { $ne: true } },
      { $set: { expiresAt: new Date("2099-01-01T00:00:00.000Z"), point: 90 } },
    );
    expect(response.data).toMatchObject({
      matchedCount: 4,
      scannedRewardsSkipped: 1,
    });
    await expect(
      rewardsService.updateRewardBatch(batchId, {
        expiresAt: "2000-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow(AppError);
  });

  it("physically deletes active rewards and soft-deletes inactive rewards in a batch", async () => {
    const batchId = "64a1b2c3d4e5f67890123457";
    const session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn(),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    RewardBatch.findOne.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: batchId, isDeleted: false }),
    });
    Reward.updateMany.mockResolvedValue({ modifiedCount: 2 });
    Reward.deleteMany.mockResolvedValue({ deletedCount: 3 });
    RewardBatch.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const response = await rewardsService.deleteRewardBatch(batchId);

    expect(Reward.updateMany).toHaveBeenCalledWith(
      { batchId, active: false, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: expect.any(Date) } },
      { session },
    );
    expect(Reward.deleteMany).toHaveBeenCalledWith(
      { batchId, active: { $ne: false }, isDeleted: { $ne: true } },
      { session },
    );
    expect(response.data).toEqual({
      physicallyDeletedCount: 3,
      softDeletedCount: 2,
    });
  });

  it("moves a scanned reward from active to inactive counts once", async () => {
    const batchId = "64a1b2c3d4e5f67890123457";
    const rewardId = "64a1b2c3d4e5f67890123458";
    const session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn(),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    Reward.findById.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue({
          _id: rewardId,
          batchId,
          active: true,
          isRedeemed: false,
        }),
    });
    Reward.findByIdAndUpdate.mockResolvedValue({ _id: rewardId });
    RewardBatch.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await rewardsService.markRewardRedeemed(
      rewardId,
      "64a1b2c3d4e5f67890123459",
    );

    expect(RewardBatch.updateOne).toHaveBeenCalledWith(
      { _id: batchId },
      { $inc: { activeCount: -1, inactiveCount: 1 } },
      { session },
    );
  });

  it("decrements the correct batch counters when a reward is deleted", async () => {
    const batchId = "64a1b2c3d4e5f67890123457";
    const rewardId = "64a1b2c3d4e5f67890123458";
    const session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn(),
    };
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    Reward.findByIdAndDelete.mockResolvedValue({
      _id: rewardId,
      batchId,
      active: false,
    });
    RewardBatch.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await rewardsService.deleteReward(rewardId);

    expect(RewardBatch.updateOne).toHaveBeenCalledWith(
      { _id: batchId },
      { $inc: { totalCount: -1, inactiveCount: -1 } },
      { session },
    );
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});

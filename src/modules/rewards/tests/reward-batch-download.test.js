const fs = require("fs/promises");

jest.mock("../../../schemas/reward.schema", () => ({ find: jest.fn() }));
jest.mock("../../../schemas/reward-batch.schema", () => ({
  findOne: jest.fn(),
}));
jest.mock("../../../schemas/product.schema", () => ({ findById: jest.fn() }));

const Reward = require("../../../schemas/reward.schema");
const RewardBatch = require("../../../schemas/reward-batch.schema");
const Product = require("../../../schemas/product.schema");
const {
  createRewardBatchArchive,
  getRewardBatchArchive,
} = require("../reward-batch-download.service");

const batchId = "64c76dce4b8e9ca5ce208c61";
const reward = {
  _id: "64c76dce4b8e9ca5ce208c62",
  productId: "64c76dce4b8e9ca5ce208c63",
  uidCode: "TEST1234",
  point: 10,
  active: true,
  expiresAt: new Date("2027-01-01T00:00:00.000Z"),
};

const cursorFor = (items) => ({
  async *[Symbol.asyncIterator]() {
    yield* items;
  },
  close: jest.fn().mockResolvedValue(undefined),
});

describe("reward batch archive generation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RewardBatch.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: batchId,
        productId: reward.productId,
        createdAt: new Date("2026-10-08T00:00:00.000Z"),
        totalCount: 1,
      }),
    });
    Product.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ name: "Regular 501" }),
      }),
    });
    Reward.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockReturnValue({
            cursor: jest.fn().mockReturnValue(cursorFor([reward])),
          }),
      }),
    });
  });

  it("creates a downloadable ZIP containing the batch vouchers", async () => {
    const archive = await createRewardBatchArchive(batchId);
    const archivePath = await getRewardBatchArchive(archive.token);

    expect(archive.fileName).toBe("Vouchers_Regular_501_20261008.zip");
    expect(archive.rewardCount).toBe(1);
    expect(archivePath).toBeTruthy();
    expect((await fs.stat(archivePath)).size).toBeGreaterThan(0);

    await fs.rm(archivePath, { force: true });
  });

  it("rejects batches with no rewards", async () => {
    Reward.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockReturnValue({
            cursor: jest.fn().mockReturnValue(cursorFor([])),
          }),
      }),
    });

    await expect(createRewardBatchArchive(batchId)).rejects.toMatchObject({
      statusCode: 404,
      message: "No rewards found in this batch",
    });
  });
});

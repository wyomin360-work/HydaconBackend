jest.mock("../../schemas/reward.schema", () => ({
  countDocuments: jest.fn(),
}));
jest.mock("../../schemas/product.schema", () => ({}));
jest.mock("../../schemas/reward-batch.schema", () => ({}));

const Reward = require("../../schemas/reward.schema");
const { skipEmptyBatchOrThrow } = require("../migrate-reward-voucher-uids");

describe("skipEmptyBatchOrThrow", () => {
  const batch = { _id: "empty-batch" };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("skips a batch with no rewards", async () => {
    Reward.countDocuments.mockResolvedValue(0);

    await expect(
      skipEmptyBatchOrThrow(batch, "missing metadata"),
    ).resolves.toBe(true);
    expect(Reward.countDocuments).toHaveBeenCalledWith({ batchId: batch._id });
  });

  it("fails when the batch still contains rewards", async () => {
    Reward.countDocuments.mockResolvedValue(1);

    await expect(
      skipEmptyBatchOrThrow(batch, "missing metadata"),
    ).rejects.toThrow("missing metadata");
  });
});

jest.mock("../../../config/redis", () => null);
jest.mock("bullmq", () => ({}));
jest.mock("../reward-batch-download.service", () => ({
  createRewardBatchArchive: jest.fn(),
  isRewardBatchArchiveAvailable: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../../schemas/reward-batch-download-job.schema", () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  create: jest.fn(),
  createIndexes: jest.fn(),
}));

const RewardBatchDownloadJob = require("../../../schemas/reward-batch-download-job.schema");
const {
  createRewardBatchArchive,
  isRewardBatchArchiveAvailable,
} = require("../reward-batch-download.service");
const {
  startInlineRewardBatchDownload,
  getRewardBatchDownloadJob,
} = require("../reward-batch-download.queue");

describe("Mongo-backed inline reward ZIP jobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RewardBatchDownloadJob.findOne.mockResolvedValue(null);
    RewardBatchDownloadJob.updateOne.mockResolvedValue({ acknowledged: true });
    createRewardBatchArchive.mockResolvedValue({
      token: "archive-token",
      fileName: "rewards.zip",
      rewardCount: 1,
    });
  });

  it("persists the job before starting inline generation", async () => {
    const job = {
      _id: "64c76dce4b8e9ca5ce208c61",
      batchId: "64c76dce4b8e9ca5ce208c62",
      rewardIds: [],
      leaseOwner: "worker-1",
      toObject() {
        return this;
      },
    };
    RewardBatchDownloadJob.create.mockResolvedValue(job);

    const jobId = await startInlineRewardBatchDownload(job.batchId);

    expect(jobId).toBe(job._id);
    expect(RewardBatchDownloadJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: job.batchId,
        requestKey: expect.stringMatching(/^[a-f0-9]{64}$/),
        state: "active",
      }),
    );
    expect(createRewardBatchArchive).toHaveBeenCalledWith(
      job.batchId,
      expect.any(Function),
      null,
    );
  });

  it("reclaims a completed inline job when its cached S3 object is missing", async () => {
    const oldJob = {
      _id: "64c76dce4b8e9ca5ce208c61",
      batchId: "64c76dce4b8e9ca5ce208c62",
      rewardIds: [],
      leaseOwner: "worker-old",
      state: "completed",
      finishedAt: new Date(),
      updatedAt: new Date(),
      result: { s3Key: "reward-batch-downloads/missing.zip" },
    };
    const replacementJob = {
      ...oldJob,
      leaseOwner: "worker-new",
      state: "active",
      toObject() {
        return this;
      },
    };
    RewardBatchDownloadJob.findOne.mockResolvedValue(oldJob);
    RewardBatchDownloadJob.findOneAndUpdate.mockResolvedValue(replacementJob);
    isRewardBatchArchiveAvailable.mockResolvedValueOnce(false);

    const jobId = await startInlineRewardBatchDownload(oldJob.batchId);

    expect(isRewardBatchArchiveAvailable).toHaveBeenCalledWith(oldJob.result);
    expect(jobId).toBe(oldJob._id);
    expect(RewardBatchDownloadJob.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: oldJob._id }),
      expect.objectContaining({
        $set: expect.objectContaining({ state: "active" }),
      }),
      { new: true },
    );
  });

  it("serves inline job status from shared Mongo state", async () => {
    const job = {
      _id: "64c76dce4b8e9ca5ce208c61",
      state: "active",
      progress: { phase: "generating", percent: 42 },
      leaseUntil: new Date(Date.now() + 60_000),
    };
    RewardBatchDownloadJob.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(job),
    });

    await expect(getRewardBatchDownloadJob(job._id)).resolves.toEqual({
      state: "active",
      progress: job.progress,
      result: undefined,
      error: undefined,
    });
  });

  it("reuses an active inline job so repeat clicks cannot start another ZIP", async () => {
    RewardBatchDownloadJob.findOne.mockResolvedValue({
      _id: "64c76dce4b8e9ca5ce208c61",
      state: "active",
      leaseUntil: new Date(Date.now() + 60_000),
    });

    const jobId = await startInlineRewardBatchDownload(
      "64c76dce4b8e9ca5ce208c62",
    );

    expect(jobId).toBe("64c76dce4b8e9ca5ce208c61");
    expect(RewardBatchDownloadJob.create).not.toHaveBeenCalled();
    expect(createRewardBatchArchive).not.toHaveBeenCalled();
  });
});

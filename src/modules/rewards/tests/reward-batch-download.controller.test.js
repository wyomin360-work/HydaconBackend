jest.mock("../rewards.service", () => ({}));
jest.mock("../reward-batch-download.service", () => ({
  createRewardBatchArchive: jest.fn(),
  getRewardBatchArchive: jest.fn(),
}));
jest.mock("../reward-batch-download.queue", () => ({
  getRewardBatchDownloadQueue: jest.fn(),
  getRewardBatchDownloadJob: jest.fn(),
}));

const controller = require("../rewards.controller");
const archiveService = require("../reward-batch-download.service");
const downloadQueue = require("../reward-batch-download.queue");

const response = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

describe("reward batch download controller", () => {
  beforeEach(() => jest.clearAllMocks());

  it("generates inline and returns a download URL when the queue is unavailable", async () => {
    downloadQueue.getRewardBatchDownloadQueue.mockReturnValue(null);
    archiveService.createRewardBatchArchive.mockResolvedValue({
      token: "123e4567-e89b-12d3-a456-426614174000",
      fileName: "Vouchers_Product_20261009.zip",
      rewardCount: 1001,
    });
    const res = response();

    await controller.createRewardBatchDownload(
      {
        params: { batchId: "6ac76dce4b8e9ca5ce208c6" },
        protocol: "https",
        get: (header) => (header === "host" ? "api.hydacon.test" : undefined),
      },
      res,
    );

    expect(archiveService.createRewardBatchArchive).toHaveBeenCalledWith(
      "6ac76dce4b8e9ca5ce208c6",
      undefined,
      null,
    );
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      data: {
        data: {
          status: "completed",
          token: "123e4567-e89b-12d3-a456-426614174000",
          fileName: "Vouchers_Product_20261009.zip",
          rewardCount: 1001,
          downloadUrl:
            "https://api.hydacon.test/reward-batch-downloads/123e4567-e89b-12d3-a456-426614174000?filename=Vouchers_Product_20261009.zip",
        },
      },
    });
  });

  it("queues generation when BullMQ and Redis are available", async () => {
    const add = jest.fn().mockResolvedValue({ id: "job-123" });
    downloadQueue.getRewardBatchDownloadQueue.mockReturnValue({ add });
    const res = response();

    await controller.createRewardBatchDownload(
      { params: { batchId: "6ac76dce4b8e9ca5ce208c6" } },
      res,
    );

    expect(add).toHaveBeenCalledWith(
      "generate-reward-batch-zip",
      { batchId: "6ac76dce4b8e9ca5ce208c6", rewardIds: null },
      expect.objectContaining({
        attempts: 2,
        jobId: expect.stringMatching(/^batchzip-[a-f0-9]{64}$/),
      }),
    );
    expect(archiveService.createRewardBatchArchive).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      data: { data: { status: "processing", jobId: "job-123" } },
    });
  });

  it("uses the same queue job for repeated requests for the same batch", async () => {
    const add = jest.fn().mockResolvedValue({ id: "same-job" });
    downloadQueue.getRewardBatchDownloadQueue.mockReturnValue({ add });
    const request = {
      params: { batchId: "6ac76dce4b8e9ca5ce208c6" },
      body: { rewardIds: ["6ac76dce4b8e9ca5ce208c7", "6ac76dce4b8e9ca5ce208c8"] },
    };

    await controller.createRewardBatchDownload(request, response());
    await controller.createRewardBatchDownload(
      { ...request, body: { rewardIds: [...request.body.rewardIds].reverse() } },
      response(),
    );

    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[0][2].jobId).toBe(add.mock.calls[1][2].jobId);
  });
});

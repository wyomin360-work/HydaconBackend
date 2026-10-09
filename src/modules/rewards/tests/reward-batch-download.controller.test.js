jest.mock("../rewards.service", () => ({}));
jest.mock("../reward-batch-download.service", () => ({
  createRewardBatchArchive: jest.fn(),
  getRewardBatchArchive: jest.fn(),
}));
jest.mock("../reward-batch-download.queue", () => ({
  getRewardBatchDownloadQueue: jest.fn(),
  hasConfiguredSharedQueue: jest.fn(),
  getRewardBatchDownloadJob: jest.fn(),
  startInlineRewardBatchDownload: jest.fn(),
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

  it("starts inline generation with pollable progress when the queue is unavailable", async () => {
    downloadQueue.getRewardBatchDownloadQueue.mockReturnValue(null);
    downloadQueue.hasConfiguredSharedQueue.mockReturnValue(false);
    downloadQueue.startInlineRewardBatchDownload.mockReturnValue("inline-job");
    const res = response();

    await controller.createRewardBatchDownload(
      {
        params: { batchId: "64c76dce4b8e9ca5ce208c61" },
        protocol: "https",
        get: (header) => (header === "host" ? "api.hydacon.test" : undefined),
      },
      res,
    );

    expect(downloadQueue.startInlineRewardBatchDownload).toHaveBeenCalledWith(
      "64c76dce4b8e9ca5ce208c61",
      null,
    );
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      data: { data: { status: "processing", jobId: "inline-job" } },
    });
  });

  it("returns a retryable error instead of creating a local job during a shared Redis outage", async () => {
    downloadQueue.getRewardBatchDownloadQueue.mockReturnValue(null);
    downloadQueue.hasConfiguredSharedQueue.mockReturnValue(true);

    await expect(
      controller.createRewardBatchDownload(
        { params: { batchId: "64c76dce4b8e9ca5ce208c61" } },
        response(),
      ),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(downloadQueue.startInlineRewardBatchDownload).not.toHaveBeenCalled();
  });

  it("explains when a ZIP job was lost or expired and must be restarted", async () => {
    downloadQueue.hasConfiguredSharedQueue.mockReturnValue(false);
    downloadQueue.getRewardBatchDownloadJob.mockResolvedValue(null);

    await expect(
      controller.rewardBatchDownloadStatus(
        { params: { jobId: "missing-job" } },
        response(),
      ),
    ).rejects.toMatchObject({
      statusCode: 410,
      message: expect.stringContaining("Please start the download again"),
    });
  });

  it("queues generation when BullMQ and Redis are available", async () => {
    const add = jest.fn().mockResolvedValue({ id: "job-123" });
    downloadQueue.getRewardBatchDownloadQueue.mockReturnValue({
      add,
      getJob: jest.fn().mockResolvedValue(null),
    });
    const res = response();

    await controller.createRewardBatchDownload(
      { params: { batchId: "64c76dce4b8e9ca5ce208c61" } },
      res,
    );

    expect(add).toHaveBeenCalledWith(
      "generate-reward-batch-zip",
      { batchId: "64c76dce4b8e9ca5ce208c61", rewardIds: null },
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
    const jobs = new Map();
    const add = jest.fn().mockImplementation(async (name, data, options) => {
      const job = {
        id: options.jobId,
        getState: jest.fn().mockResolvedValue("active"),
      };
      jobs.set(options.jobId, job);
      return job;
    });
    const getJob = jest
      .fn()
      .mockImplementation(async (jobId) => jobs.get(jobId) || null);
    downloadQueue.getRewardBatchDownloadQueue.mockReturnValue({ add, getJob });
    const request = {
      params: { batchId: "64c76dce4b8e9ca5ce208c61" },
      body: {
        rewardIds: ["64c76dce4b8e9ca5ce208c62", "64c76dce4b8e9ca5ce208c63"],
      },
    };

    await controller.createRewardBatchDownload(request, response());
    await controller.createRewardBatchDownload(
      {
        ...request,
        body: { rewardIds: [...request.body.rewardIds].reverse() },
      },
      response(),
    );

    expect(add).toHaveBeenCalledTimes(1);
    expect(getJob).toHaveBeenCalledTimes(2);
  });

  it("replaces failed queue jobs so users can retry a failed ZIP", async () => {
    const failedJob = {
      id: "old-job",
      getState: jest.fn().mockResolvedValue("failed"),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const add = jest.fn().mockResolvedValue({ id: "new-job" });
    const getJob = jest
      .fn()
      .mockResolvedValueOnce(failedJob)
      .mockResolvedValueOnce(null);
    downloadQueue.getRewardBatchDownloadQueue.mockReturnValue({ add, getJob });

    const res = response();
    await controller.createRewardBatchDownload(
      { params: { batchId: "64c76dce4b8e9ca5ce208c61" } },
      res,
    );

    expect(failedJob.remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      data: { data: { status: "processing", jobId: "new-job" } },
    });
  });

  it("replaces completed jobs when their saved download URL is nearing expiry", async () => {
    const staleJob = {
      id: "stale-job",
      finishedOn: Date.now() - 55 * 60 * 1000,
      getState: jest.fn().mockResolvedValue("completed"),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const add = jest.fn().mockResolvedValue({ id: "fresh-job" });
    const getJob = jest
      .fn()
      .mockResolvedValueOnce(staleJob)
      .mockResolvedValueOnce(null);
    downloadQueue.getRewardBatchDownloadQueue.mockReturnValue({ add, getJob });

    const res = response();
    await controller.createRewardBatchDownload(
      { params: { batchId: "64c76dce4b8e9ca5ce208c61" } },
      res,
    );

    expect(staleJob.remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      data: { data: { status: "processing", jobId: "fresh-job" } },
    });
  });
});

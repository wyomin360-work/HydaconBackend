const videoService = require("../../src/modules/videos/video.service");
const videoController = require("../../src/modules/videos/video.controller");
const Video = require("../../src/schemas/video.schema");
const VideoAnalytics = require("../../src/schemas/videoAnalytics.schema");

// Mock the Video schema
jest.mock("../../src/schemas/video.schema");
// Mock VideoAnalytics so updateMetrics doesn't hit real Mongoose ObjectId casting
jest.mock("../../src/schemas/videoAnalytics.schema");

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn();

const makeVideoDoc = (overrides = {}) => ({
  _id: "video123",
  title: "Test Video",
  slug: "test-video-abc123",
  thumbnailUrl: "https://cdn.example.com/thumb.jpg",
  videoUrl: "https://cdn.example.com/video.mp4",
  duration: "02:30",
  tags: ["test"],
  language: "en",
  region: "IN",
  sortOrder: 0,
  featured: false,
  active: true,
  views: 10,
  saves: 5,
  shares: 2,
  publishedDate: new Date(),
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

// ─────────────────────────────────────────────
// SERVICE TESTS
// ─────────────────────────────────────────────
describe("Video Service", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("createVideo", () => {
    it("should save a new video and return it", async () => {
      const mockVideo = makeVideoDoc();
      mockVideo.save = jest.fn().mockResolvedValue(mockVideo);
      Video.mockImplementation(() => mockVideo);

      const result = await videoService.createVideo({
        title: "Test Video",
        thumbnailUrl: "https://t.com/t.jpg",
        videoUrl: "https://v.com/v.mp4",
      });

      expect(mockVideo.save).toHaveBeenCalledTimes(1);
      expect(result.title).toBe("Test Video");
    });
  });


  // ── updateVideo ──────────────────────────
  describe("updateVideo", () => {
    it("should update and return the video", async () => {
      const updated = makeVideoDoc({ title: "Updated Title" });
      Video.findByIdAndUpdate = jest.fn().mockResolvedValue(updated);

      const result = await videoService.updateVideo("video123", { title: "Updated Title" });

      expect(Video.findByIdAndUpdate).toHaveBeenCalledWith("video123", { title: "Updated Title" }, { new: true });
      expect(result.title).toBe("Updated Title");
    });
  });

  // ── deleteVideo (hard delete) ────────────
  describe("deleteVideo", () => {
    it("should hard-delete the video using findByIdAndDelete", async () => {
      const deleted = makeVideoDoc();
      Video.findByIdAndDelete = jest.fn().mockResolvedValue(deleted);

      const result = await videoService.deleteVideo("video123");

      expect(Video.findByIdAndDelete).toHaveBeenCalledWith("video123");
      expect(result._id).toBe("video123");
    });

    it("should return null if video not found", async () => {
      Video.findByIdAndDelete = jest.fn().mockResolvedValue(null);

      const result = await videoService.deleteVideo("nonexistent");

      expect(result).toBeNull();
    });
  });

  // ── getVideoById ─────────────────────────
  describe("getVideoById", () => {
    it("should return populated video by id", async () => {
      const video = makeVideoDoc();
      const populateChain = { populate: jest.fn().mockReturnThis() };
      populateChain.populate.mockReturnValueOnce({ populate: jest.fn().mockResolvedValue(video) });
      Video.findById = jest.fn().mockReturnValue(populateChain);

      const result = await videoService.getVideoById("video123");

      expect(Video.findById).toHaveBeenCalledWith("video123");
    });
  });

  // ── listVideos ───────────────────────────
  describe("listVideos", () => {
    it("should return paginated result with correct structure", async () => {
      const videos = [makeVideoDoc(), makeVideoDoc({ _id: "video456" })];
      const populateChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
      };
      populateChain.populate.mockReturnValueOnce(populateChain).mockResolvedValueOnce(videos);
      Video.find = jest.fn().mockReturnValue(populateChain);
      Video.countDocuments = jest.fn().mockResolvedValue(2);

      const result = await videoService.listVideos({ active: true }, { page: 1, limit: 10 });

      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("totalPages");
      expect(result.page).toBe(1);
    });
  });

  // ── toggleStatus ─────────────────────────
  describe("toggleStatus", () => {
    it("should flip active from true to false", async () => {
      const video = makeVideoDoc({ active: true });
      Video.findById = jest.fn().mockResolvedValue(video);
      video.save = jest.fn().mockResolvedValue({ ...video, active: false });

      const result = await videoService.toggleStatus("video123");

      expect(Video.findById).toHaveBeenCalledWith("video123");
      expect(video.save).toHaveBeenCalled();
      // After toggle active should be false
      expect(video.active).toBe(false);
    });

    it("should throw if video not found", async () => {
      Video.findById = jest.fn().mockResolvedValue(null);

      await expect(videoService.toggleStatus("nonexistent")).rejects.toThrow("Video not found");
    });
  });

  // ── updateMetrics ─────────────────────────
  describe("updateMetrics", () => {
    it.each(["views", "saves", "shares"])("should increment %s by 1", async (metricType) => {
      const updated = makeVideoDoc({ [metricType]: 11 });
      Video.findByIdAndUpdate = jest.fn().mockResolvedValue(updated);
      VideoAnalytics.findOneAndUpdate = jest.fn().mockResolvedValue({});

      const result = await videoService.updateMetrics("video123", metricType);

      expect(Video.findByIdAndUpdate).toHaveBeenCalledWith(
        "video123",
        { $inc: { [metricType]: 1 } },
        { new: true }
      );
      expect(result[metricType]).toBe(11);
    });

    it("should throw on invalid metric type", async () => {
      await expect(videoService.updateMetrics("video123", "invalid")).rejects.toThrow("Invalid metric type");
    });
  });

  // ── getFeaturedVideos ─────────────────────
  describe("getFeaturedVideos", () => {
    it("should return featured active videos sorted by sortOrder", async () => {
      const featured = [makeVideoDoc({ featured: true }), makeVideoDoc({ _id: "v2", featured: true })];
      const chain = {
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
      };
      chain.populate.mockReturnValueOnce(chain).mockResolvedValueOnce(featured);
      Video.find = jest.fn().mockReturnValue(chain);

      const result = await videoService.getFeaturedVideos();

      expect(Video.find).toHaveBeenCalledWith({ featured: true, active: true });
    });
  });
});

// ─────────────────────────────────────────────
// CONTROLLER TESTS
// ─────────────────────────────────────────────
describe("Video Controller", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── createVideo ───────────────────────────
  describe("createVideo", () => {
    it("should respond 201 with created video", async () => {
      const created = makeVideoDoc();
      Video.mockImplementation(() => ({ ...created, save: jest.fn().mockResolvedValue(created) }));
      jest.spyOn(require("../../src/modules/videos/video.service"), "createVideo").mockResolvedValue(created);

      const req = { body: { title: "Test Video", thumbnailUrl: "https://t.com/t.jpg", videoUrl: "https://v.com/v.mp4" } };
      const res = mockRes();

      await videoController.createVideo(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  // ── deleteVideo ────────────────────────────
  describe("deleteVideo — hard delete", () => {
    it("should return 200 with deleted video", async () => {
      const deleted = makeVideoDoc();
      jest.spyOn(require("../../src/modules/videos/video.service"), "deleteVideo").mockResolvedValue(deleted);

      const req = { params: { id: "video123" } };
      const res = mockRes();

      await videoController.deleteVideo(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 404 if video not found", async () => {
      jest.spyOn(require("../../src/modules/videos/video.service"), "deleteVideo").mockResolvedValue(null);

      const req = { params: { id: "nonexistent" } };
      const res = mockRes();

      await videoController.deleteVideo(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // ── updateMetrics — validation ────────────
  describe("updateMetrics — metricType validation", () => {
    it("should return 400 for invalid metric type", async () => {
      const req = { params: { id: "video123" }, body: { metricType: "likes" } };
      const res = mockRes();

      await videoController.updateMetrics(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should succeed for valid metric type 'views'", async () => {
      const updated = makeVideoDoc({ views: 11 });
      jest.spyOn(require("../../src/modules/videos/video.service"), "updateMetrics").mockResolvedValue(updated);

      const req = { params: { id: "video123" }, body: { metricType: "views" } };
      const res = mockRes();

      await videoController.updateMetrics(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ── Schema: publishedDate field name ──────
  describe("Schema field: publishedDate", () => {
    it("video schema should use publishedDate not publishedAt", () => {
      const schemaPaths = Object.keys(Video.schema ? Video.schema.paths || {} : {});
      // Since schema is mocked, just verify the field constant in the actual source
      const videoSchemaSource = require("fs").readFileSync(
        require("path").join(__dirname, "../../src/schemas/video.schema.js"),
        "utf8"
      );
      expect(videoSchemaSource).toContain("publishedDate");
      expect(videoSchemaSource).not.toContain("publishedAt");
    });
  });
});

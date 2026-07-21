const videoService = require("./video.service");
const { sendResponse } = require("../../utils/responseHandlers");
const { getPaginationParams } = require("../../utils/heplers");
const ffmpeg = require("fluent-ffmpeg");
const ffprobeStatic = require("ffprobe-static");
const axios = require("axios");

ffmpeg.setFfprobePath(ffprobeStatic.path);

const getVideoDuration = (url) => {
  return new Promise((resolve) => {
    // If it's a YouTube URL, fetch duration from the page source
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      axios
        .get(url)
        .then(({ data }) => {
          const match = data.match(/"lengthSeconds":"(\d+)"/);
          if (match && match[1]) {
            const durationInSeconds = parseInt(match[1], 10);
            const minutes = Math.floor(durationInSeconds / 60);
            const seconds = Math.floor(durationInSeconds % 60);
            return resolve(
              `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
            );
          }

          const metaMatch = data.match(/itemprop="duration" content="([^"]+)"/);
          if (metaMatch && metaMatch[1]) {
            let durationStr = metaMatch[1];
            let minutes = 0;
            let seconds = 0;
            const minMatch = durationStr.match(/(\d+)M/);
            if (minMatch) minutes = parseInt(minMatch[1], 10);
            const secMatch = durationStr.match(/(\d+)S/);
            if (secMatch) seconds = parseInt(secMatch[1], 10);
            return resolve(
              `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
            );
          }
          resolve("00:00");
        })
        .catch(() => resolve("00:00"));
      return;
    }

    // Default to ffprobe for regular video files
    ffmpeg.ffprobe(url, (err, metadata) => {
      if (err || !metadata || !metadata.format || !metadata.format.duration) {
        resolve("00:00"); // fallback
      } else {
        const durationInSeconds = metadata.format.duration;
        const minutes = Math.floor(durationInSeconds / 60);
        const seconds = Math.floor(durationInSeconds % 60);
        resolve(
          `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
        );
      }
    });
  });
};
const generateSlug = (title) => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
};

const createVideo = async (req, res, next) => {
  try {
    const data = req.body;
    data.slug = generateSlug(data.title) + "-" + Date.now().toString(36);

    // Sanitize empty strings to prevent Mongoose CastError
    if (data.categoryId === "") data.categoryId = null;
    if (data.productId === "") data.productId = null;

    // Fetch duration dynamically if not provided or hardcoded to "00:00"
    if (data.videoUrl && (!data.duration || data.duration === "00:00")) {
      data.duration = await getVideoDuration(data.videoUrl);
    } else if (!data.duration) {
      data.duration = "00:00";
    }

    const video = await videoService.createVideo(data);
    return sendResponse(res, video, 201, "Video created successfully");
  } catch (error) {
    next(error);
  }
};

const updateVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;

    if (data.categoryId === "") data.categoryId = null;
    if (data.productId === "") data.productId = null;

    if (data.videoUrl) {
      const existing = await videoService.getVideoById(id);
      const urlChanged = existing && existing.videoUrl !== data.videoUrl;

      // Recompute if URL changed, or duration is missing/placeholder
      if (urlChanged || !data.duration || data.duration === "00:00") {
        data.duration = await getVideoDuration(data.videoUrl);
      }
    }

    const video = await videoService.updateVideo(id, data);
    if (!video) {
      return sendResponse(res, null, 404, "Video not found");
    }
    return sendResponse(res, video, 200, "Video updated successfully");
  } catch (error) {
    next(error);
  }
};

const deleteVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const video = await videoService.deleteVideo(id);
    if (!video) {
      return sendResponse(res, null, 404, "Video not found");
    }
    return sendResponse(res, video, 200, "Video deleted successfully");
  } catch (error) {
    next(error);
  }
};

const getVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const video = await videoService.getVideoById(id);
    if (!video) {
      return sendResponse(res, null, 404, "Video not found");
    }
    return sendResponse(res, video, 200, "Video fetched successfully");
  } catch (error) {
    next(error);
  }
};

const listVideos = async (req, res, next) => {
  try {
    const paginationParams = getPaginationParams(req.body);
    const {
      search,
      categoryId,
      productId,
      language,
      active,
      featured,
      sortBy,
      sortOrder,
    } = req.body;

    const query = {};
    query.deleted = { $ne: true };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    if (categoryId) query.categoryId = categoryId;
    if (productId) query.productId = productId;
    if (language) query.language = language;

    if (active !== undefined) {
      query.active = active === true ? true : { $ne: true };
    }
    if (featured !== undefined) query.featured = featured;

    if (req.role !== "ADMIN") {
      query.active = true;
    }

    let actualSortBy = sortBy || "createdAt";
    if (actualSortBy === "newest") actualSortBy = "createdAt";
    let actualSortOrder = sortOrder || "desc";

    const result = await videoService.listVideos(query, {
      ...paginationParams,
      sortBy: actualSortBy,
      sortOrder: actualSortOrder,
    });

    return sendResponse(res, result, 200, "Videos fetched successfully");
  } catch (error) {
    next(error);
  }
};

const toggleStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const video = await videoService.toggleStatus(id);
    return sendResponse(res, video, 200, "Video status updated successfully");
  } catch (error) {
    next(error);
  }
};

const softDeleteVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const video = await videoService.softDeleteVideo(id);
    if (!video) {
      return sendResponse(res, null, 404, "Video not found");
    }
    return sendResponse(res, video, 200, "Video soft deleted successfully");
  } catch (error) {
    next(error);
  }
};

const restoreVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const video = await videoService.restoreVideo(id);
    if (!video) {
      return sendResponse(res, null, 404, "Video not found");
    }
    return sendResponse(res, video, 200, "Video restored successfully");
  } catch (error) {
    next(error);
  }
};

const getVideoCounts = async (req, res, next) => {
  try {
    const counts = await videoService.countVideos();
    return sendResponse(res, counts, 200, "Video counts fetched successfully");
  } catch (error) {
    next(error);
  }
};

const updateMetrics = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { metricType } = req.body;
    if (!["views", "saves", "shares"].includes(metricType)) {
      return sendResponse(res, null, 400, "Invalid metric type");
    }
    const video = await videoService.updateMetrics(id, metricType);
    if (!video) {
      return sendResponse(res, null, 404, "Video not found");
    }
    return sendResponse(res, video, 200, "Video metrics updated successfully");
  } catch (error) {
    next(error);
  }
};

// GET handler for metrics increment via query params (used by mobile)
const getMetrics = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { metricType } = req.query;
    if (!metricType || !["views", "saves", "shares"].includes(metricType)) {
      return sendResponse(res, null, 400, "Invalid metric type");
    }
    const video = await videoService.updateMetrics(id, metricType);
    if (!video) {
      return sendResponse(res, null, 404, "Video not found");
    }
    return sendResponse(
      res,
      video,
      200,
      "Video metrics incremented successfully",
    );
  } catch (error) {
    next(error);
  }
};

const getFeaturedVideos = async (req, res, next) => {
  try {
    const videos = await videoService.getFeaturedVideos();
    return sendResponse(
      res,
      videos,
      200,
      "Featured videos fetched successfully",
    );
  } catch (error) {
    next(error);
  }
};

// GET /:id/analytics?days=30  — time-series analytics for admin dashboard
const getAnalytics = async (req, res, next) => {
  try {
    const { id } = req.params;
    const days = parseInt(req.query.days, 10) || 30;
    const data = await videoService.getAnalytics(id, days);
    return sendResponse(res, data, 200, "Video analytics fetched successfully");
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createVideo,
  updateVideo,
  deleteVideo,
  getVideo,
  listVideos,
  toggleStatus,
  updateMetrics,
  getMetrics,
  getAnalytics,
  getFeaturedVideos,
  softDeleteVideo,
  restoreVideo,
  getVideoCounts,
};

const Video = require("../../schemas/video.schema");
const VideoAnalytics = require("../../schemas/videoAnalytics.schema");

// Helper: return today as 'YYYY-MM-DD'
const todayStr = () => new Date().toISOString().slice(0, 10);

const GiftCategory = require("../../schemas/gift-category.schema");

const createVideo = async (data) => {
  const video = new Video(data);
  return await video.save();
};

const updateVideo = async (id, data) => {
  return await Video.findByIdAndUpdate(id, data, { new: true });
};

const deleteVideo = async (id) => {
  // Hard delete: removes the document permanently
  return await Video.findByIdAndDelete(id);
};

// Soft delete: mark the video as deleted (recoverable)
const softDeleteVideo = async (id) => {
  return await Video.findByIdAndUpdate(id, { deleted: true }, { new: true });
};

// Restore a soft‑deleted video
const restoreVideo = async (id) => {
  return await Video.findByIdAndUpdate(id, { deleted: false }, { new: true });
};


const getVideoById = async (id) => {
  return await Video.findById(id).populate("categoryId").populate("productId");
};

const listVideos = async (query, { page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc" }) => {
  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

  const [videos, total] = await Promise.all([
    Video.find(query).sort(sort).skip(skip).limit(limit).populate("categoryId").populate("productId"),
    Video.countDocuments(query),
  ]);

  return {
    items: videos,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

const toggleStatus = async (id) => {
  const video = await Video.findById(id);
  if (!video) throw new Error("Video not found");
  
  video.active = !video.active;
  return await video.save();
};

const updateMetrics = async (id, metricType) => {
  const updateQuery = {};
  if (metricType === "views") updateQuery.$inc = { views: 1 };
  else if (metricType === "saves") updateQuery.$inc = { saves: 1 };
  else if (metricType === "shares") updateQuery.$inc = { shares: 1 };
  else throw new Error("Invalid metric type");

  // Upsert daily analytics bucket
  const incField = { [metricType]: 1 };
  await VideoAnalytics.findOneAndUpdate(
    { videoId: id, date: todayStr() },
    { $inc: incField },
    { upsert: true, new: true }
  );

  return await Video.findByIdAndUpdate(id, updateQuery, { new: true });
};

/**
 * Return daily time-series analytics for a video.
 * @param {string} id - Video ObjectId
 * @param {number} days - Number of past days to include (default 30)
 */
const getAnalytics = async (id, days = 30) => {
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  const fromStr = from.toISOString().slice(0, 10);

  const rows = await VideoAnalytics.find({
    videoId: id,
    date: { $gte: fromStr },
  }).sort({ date: 1 }).lean();

  // Build a map so we can fill gaps with zeroes
  const byDate = {};
  rows.forEach((r) => { byDate[r.date] = r; });

  const series = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    series.push({
      date: key,
      views: byDate[key]?.views ?? 0,
      saves: byDate[key]?.saves ?? 0,
      shares: byDate[key]?.shares ?? 0,
    });
  }

  // Totals for summary cards
  const video = await Video.findById(id).select('views saves shares title').lean();

  return {
    series,
    totals: {
      views: video?.views ?? 0,
      saves: video?.saves ?? 0,
      shares: video?.shares ?? 0,
    },
  };
};

// Count videos for status tabs
const countVideos = async () => {
  // Use $ne:true so documents with missing/null/undefined fields are handled correctly
  const total = await Video.countDocuments({ deleted: { $ne: true } });
  const active = await Video.countDocuments({ active: true, deleted: { $ne: true } });
  const inactive = await Video.countDocuments({ active: { $ne: true }, deleted: { $ne: true } });
  return { total, active, inactive };
};

const getFeaturedVideos = async () => {
  return await Video.find({ featured: true, active: true })
    .sort({ sortOrder: 1, createdAt: -1 })
    .populate("categoryId")
    .populate("productId");
};



module.exports = {
  createVideo,
  updateVideo,
  deleteVideo,
  softDeleteVideo,
  restoreVideo,
  getVideoById,
  listVideos,
  toggleStatus,
  updateMetrics,
  getAnalytics,
  getFeaturedVideos,
  countVideos,
};

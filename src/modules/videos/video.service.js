const Video = require("../../schemas/video.schema");

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

  return await Video.findByIdAndUpdate(id, updateQuery, { new: true });
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
  getFeaturedVideos,
  countVideos,
};

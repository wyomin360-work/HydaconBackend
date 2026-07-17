const mongoose = require("mongoose");

/**
 * One document per (videoId + date) combination.
 * date is stored as a plain YYYY-MM-DD string so grouping by day is cheap.
 */
const videoAnalyticsSchema = new mongoose.Schema(
  {
    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Video",
      required: true,
      index: true,
    },
    date: {
      type: String, // 'YYYY-MM-DD'
      required: true,
    },
    views: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Compound unique index so upserts are safe
videoAnalyticsSchema.index({ videoId: 1, date: 1 }, { unique: true });

const VideoAnalytics = mongoose.model("VideoAnalytics", videoAnalyticsSchema);
module.exports = VideoAnalytics;

const mongoose = require("mongoose");

/**
 * One document per (contentId + date) combination.
 * date is stored as a plain YYYY-MM-DD string so grouping by day is cheap.
 */
const contentAnalyticsSchema = new mongoose.Schema(
  {
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Content",
      required: true,
      index: true,
    },
    date: {
      type: String, // 'YYYY-MM-DD'
      required: true,
    },
    views: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Compound unique index so upserts are safe
contentAnalyticsSchema.index({ contentId: 1, date: 1 }, { unique: true });

const ContentAnalytics = mongoose.model(
  "ContentAnalytics",
  contentAnalyticsSchema,
);
module.exports = ContentAnalytics;

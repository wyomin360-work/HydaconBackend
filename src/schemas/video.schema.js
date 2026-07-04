const { default: mongoose } = require("mongoose");

const videoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: false },
    thumbnailUrl: { type: String, required: true },
    videoUrl: { type: String, required: true },
    duration: { type: String, required: false }, // Store duration as string (e.g. "02:30") or number of seconds
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GiftCategory", // Using GiftCategory for now as it's the primary category model
      required: false,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: false,
    },
    tags: { type: [String], required: false, default: [] },
    language: { type: String, required: false },
    region: { type: String, required: false },
    sortOrder: { type: Number, required: false, default: 0 },
    featured: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    deleted: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    publishedDate: { type: Date, default: Date.now },

  },
  { timestamps: true }
);

// Add indexes for optimized querying
videoSchema.index({ title: 1 });
videoSchema.index({ categoryId: 1 });
videoSchema.index({ productId: 1 });
videoSchema.index({ active: 1 });
videoSchema.index({ featured: 1 });
videoSchema.index({ deleted: 1 });

const Video = mongoose.model("Video", videoSchema);
module.exports = Video;

const mongoose = require("mongoose");

const rateLimitSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },
    hits: {
      type: Number,
      default: 1,
    },
    resetTime: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

// TTL index to automatically purge records once resetTime is reached
rateLimitSchema.index({ resetTime: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RateLimit", rateLimitSchema);

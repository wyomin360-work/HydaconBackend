const mongoose = require("mongoose");

const contentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String, default: "" },
    description: { type: String, default: "" },
    type: {
      type: String,
      enum: ["BANNER", "ANNOUNCEMENT", "CAMPAIGN", "POPUP", "INFORMATION_CARD"],
      required: true,
    },
    placements: [{ type: String }],
    images: {
      mobile: { type: String, default: "" },
      tablet: { type: String, default: "" },
      web: { type: String, default: "" },
      thumbnail: { type: String, default: "" },
      icon: { type: String, default: "" },
    },
    detailImages: [{ type: String }],
    action: {
      type: String,
      enum: [
        "OPEN_PRODUCT",
        "OPEN_CATEGORY",
        "OPEN_REWARDS",
        "OPEN_PRODUCT_SELECTOR",
        "OPEN_COVERAGE_CALCULATOR",
        "OPEN_SCAN",
        "OPEN_EXTERNAL_URL",
        "OPEN_INTERNAL_PAGE",
        "OPEN_CAMPAIGN_DETAILS",
        "DO_NOTHING",
      ],
      default: "DO_NOTHING",
    },
    actionData: { type: mongoose.Schema.Types.Mixed },
    active: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },
    sortOrder: { type: Number, default: 0 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    dismissible: { type: Boolean, default: true },
    showOnce: { type: Boolean, default: false },
    popupType: {
      type: String,
      enum: ["FULLSCREEN", "MODAL_POPUP", "BOTTOM_SHEET", "ANNOUNCEMENT_CARD", "BANNER"],
      default: "BANNER",
    },
    audience: { type: mongoose.Schema.Types.Mixed },
    tags: [{ type: String }],
    bodyText: { type: String, default: "" },
    media: [{ type: String }],
    maxViews: { type: Number, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (doc, ret) => {
        ret.id = doc._id;
        return ret;
      },
    },
  },
);

const Content = mongoose.model("Content", contentSchema);
module.exports = Content;

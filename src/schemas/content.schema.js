const mongoose = require("mongoose");
const {
  ALLOWED_PLACEMENTS,
  ALLOWED_TYPES,
  ALLOWED_ACTIONS,
  ALLOWED_POPUP_TYPES,
  ALLOWED_FREQUENCIES,
} = require("../constants/content");

const contentImagesSchema = new mongoose.Schema(
  {
    mobile: { type: String, default: "" },
    tablet: { type: String, default: "" },
    web: { type: String, default: "" },
    thumbnail: { type: String, default: "" },
    icon: { type: String, default: "" },
  },
  { _id: false },
);

const contentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String, default: "" },
    description: { type: String, default: "" },
    type: {
      type: String,
      enum: ALLOWED_TYPES,
      required: true,
    },
    placements: [{ type: String, enum: ALLOWED_PLACEMENTS }],
    images: {
      type: contentImagesSchema,
      default: () => ({}),
    },
    detailImages: [{ type: String }],
    action: {
      type: String,
      enum: ALLOWED_ACTIONS,
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
    frequency: {
      type: String,
      enum: ALLOWED_FREQUENCIES,
    },
    popupType: {
      type: String,
      enum: [...ALLOWED_POPUP_TYPES, null],
      default: null,
    },
    ruleSetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RuleSet",
      default: null,
    },
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

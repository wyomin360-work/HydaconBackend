const mongoose = require("mongoose");

const scratchCardRuleSchema = new mongoose.Schema(
  {
    tierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tier",
      required: false,
    },
    rewardType: {
      type: String,
      enum: ["POINTS", "GIFT"],
      required: false,
    },
    minCoins: {
      type: Number,
      default: 0,
    },
    maxCoins: {
      type: Number,
      default: 0,
    },
    giftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gift",
      default: null,
    },
    productScope: {
      type: String,
      enum: ["EVERY_PRODUCT", "SELECTED_PRODUCTS"],
      default: "EVERY_PRODUCT",
    },
    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    gifts: [
      {
        giftId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Gift",
        },
        probabilityScale: {
          type: String,
          enum: ["VERY_LOW", "LOW", "MEDIUM", "HIGH", "VERY_HIGH"],
        },
        quantity: {
          type: Number,
          default: 1,
        },
      },
    ],
    active: {
      type: Boolean,
      default: true,
    },
    // Campaign Refactored Fields
    name: {
      type: String,
      required: false,
    },
    description: {
      type: String,
      default: "",
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    tierScope: {
      type: String,
      enum: ["ALL_TIERS", "SELECTED_TIERS"],
      default: "ALL_TIERS",
    },
    tiers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tier",
      },
    ],
    totalScratchLimit: {
      type: Number,
      default: 0,
    },
    perUserScratchLimit: {
      type: Number,
      default: 0,
    },
    rewards: [
      {
        rewardType: {
          type: String,
          enum: ["COIN", "GIFT", "BONUS_POINTS"],
          required: true,
        },
        minCoins: { type: Number, default: 0 },
        maxCoins: { type: Number, default: 0 },
        minPoints: { type: Number, default: 0 },
        maxPoints: { type: Number, default: 0 },
        giftId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Gift",
          default: null,
        },
        stockLimit: { type: Number, default: 0 },
        probability: { type: Number, required: true },
      },
    ],
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
  }
);

const ScratchCardRule = mongoose.model("ScratchCardRule", scratchCardRuleSchema);
module.exports = ScratchCardRule;

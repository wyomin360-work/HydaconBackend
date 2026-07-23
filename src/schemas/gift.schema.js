const mongoose = require("mongoose");
const { REWARD_CAUSE } = require("../constants/gift");

// Subdocument tracking a pending physical-gift reward for a specific user.
// Created at reward time (scratch card win, contest prize, etc.).
// Removed atomically when the user claims the gift via redeemGift().
const rewardedUserEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rewardCause: {
      type: String,
      enum: Object.values(REWARD_CAUSE),
      required: true,
    },
    rewardCauseId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    rewardCauseTitle: {
      type: String,
      default: null,
    },
    // Backlink to the Redeem scan record that triggered this reward (if any)
    redeemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Redeem",
      default: null,
    },
    rewardedAt: {
      type: Date,
      default: Date.now,
    },
    // null = no expiry; set to e.g. 30 days from rewardedAt to auto-expire
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { _id: true },
);

const giftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    giftType: {
      type: String,
      enum: ["physical", "voucher"],
      required: true,
      default: "physical",
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GiftCategory",
      required: function () {
        return this.giftType === "physical";
      },
    },
    priceInCoins: { type: Number, required: true },
    stockQuantity: { type: Number, required: true, default: 0 },
    reservedQuantity: { type: Number, required: true, default: 0 },
    image: { type: String },
    themeColor: { type: String },
    active: { type: Boolean, default: true },
    ruleSetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RuleSet",
      required: false,
    },

    // --- Pending physical-gift rewards (deferred claim) ---
    // Users listed here have been rewarded this gift (e.g. via scratch card)
    // but have not yet claimed it by providing a shipping address.
    // Stock is reserved when an entry is added and released when claimed/expired.
    rewardedUsers: {
      type: [rewardedUserEntrySchema],
      default: [],
    },

    // --- Voucher-specific fields ---
    voucherRedemptionType: {
      type: String,
      enum: ["code", "file"],
      required: function () {
        return this.giftType === "voucher";
      },
    },
    voucherCode: {
      type: String,
      required: function () {
        return (
          this.giftType === "voucher" && this.voucherRedemptionType === "code"
        );
      },
    },
    voucherFileUrl: {
      type: String,
      required: function () {
        return (
          this.giftType === "voucher" && this.voucherRedemptionType === "file"
        );
      },
    },
  },
  { timestamps: true },
);

const Gift = mongoose.model("Gift", giftSchema);
module.exports = Gift;


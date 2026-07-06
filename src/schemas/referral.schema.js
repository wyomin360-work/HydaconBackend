const mongoose = require("mongoose");

const { REFERRAL_STATUS } = require("../constants/referral");

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────
const referralSchema = new mongoose.Schema(
  {
    inviterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    inviteeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    phoneNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    invitationStatus: {
      type: String,
      enum: Object.values(REFERRAL_STATUS),
      default: REFERRAL_STATUS.PENDING,
      index: true,
    },

    firstScanReminderSent: {
      type: Number,
      enum: [0, 1],
      default: 0,
    },

    joinedAt: {
      type: Date,
      default: null,
    },

    rewardedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Composite unique index: one invite per inviter per phone number
referralSchema.index(
  { inviterId: 1, phoneNumber: 1 },
  { unique: true },
);

// ─────────────────────────────────────────────
// Model
// ─────────────────────────────────────────────
const Referral = mongoose.model("Referral", referralSchema);

Referral.REFERRAL_STATUS = REFERRAL_STATUS;

module.exports = Referral;

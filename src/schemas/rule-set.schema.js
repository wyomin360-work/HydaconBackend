const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

/* =========================
   ENUMS
========================= */

const RuleLogicOperator = {
  AND: "AND",
  OR: "OR",
};

const RuleOperator = {
  GTE: ">=",
  LTE: "<=",
  EQ: "=",
  NEQ: "!=",
  IN: "IN",
  NOT_IN: "NOT_IN",
};

const RuleScope = {
  TOTAL: "TOTAL",
  MONTH: "MONTH",
  WEEK: "WEEK",
  SEASON: "SEASON",
  PRODUCT: "PRODUCT",
  CATEGORY: "CATEGORY",
};

const RuleType = {
  // Tier
  TIER: "TIER",

  // Wallet
  HYDACOINS: "HYDACOINS",
  REDEEM_POINTS: "REDEEM_POINTS",
  CASH_BALANCE: "CASH_BALANCE",

  // Scans
  SCAN_COUNT: "SCAN_COUNT",

  // Referrals
  REFERRALS: "REFERRALS",
  SUCCESSFUL_REFERRALS: "SUCCESSFUL_REFERRALS",

  // Season
  SEASON_POINTS: "SEASON_POINTS",
  SEASON_TIER: "SEASON_TIER",
  SEASON_RANK: "SEASON_RANK",

  // Streak
  STREAK: "STREAK",

  // Profile
  PROFILE_COMPLETED: "PROFILE_COMPLETED",
  KYC_COMPLETED: "KYC_COMPLETED",
  ADDRESS_COMPLETED: "ADDRESS_COMPLETED",

  // Region
  REGION: "REGION",

  // Limits
  MAX_REDEMPTIONS_PER_USER: "MAX_REDEMPTIONS_PER_USER",
  MAX_GLOBAL_REDEMPTIONS: "MAX_GLOBAL_REDEMPTIONS",
};

/* =========================
   RULE SCHEMA
========================= */

const ruleSchema = new Schema(
  {
    type: {
      type: String,
      enum: Object.values(RuleType),
      required: true,
    },

    scope: {
      type: String,
      enum: Object.values(RuleScope),
      required: false,
    },

    operator: {
      type: String,
      enum: Object.values(RuleOperator),
      required: true,
    },

    value: {
      type: Schema.Types.Mixed,
      required: true,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false },
);

/* =========================
   RULESET SCHEMA (GLOBAL)
========================= */

const ruleSetSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },

    description: {
      type: String,
    },

    active: {
      type: Boolean,
      default: true,
    },

    logicOperator: {
      type: String,
      enum: Object.values(RuleLogicOperator),
      default: RuleLogicOperator.AND,
    },

    rules: {
      type: [ruleSchema],
      default: [],
    },

    tags: {
      type: [String],
      default: [],
    },

    version: {
      type: Number,
      default: 1,
    },

    validFrom: {
      type: Date,
    },

    validUntil: {
      type: Date,
    },

    createdBy: {
      type: Types.ObjectId,
      ref: "Admin",
    },

    updatedBy: {
      type: Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
  },
);

const RuleSet = mongoose.model("RuleSet", ruleSetSchema);

module.exports = {
  RuleSet,
  RuleLogicOperator,
  RuleOperator,
  RuleScope,
  RuleType,
};

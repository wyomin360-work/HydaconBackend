const CONTEST_STATUS = {
  UPCOMING: "upcoming",
  ONGOING: "ongoing",
  ACTIVE: "ongoing",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const REWARD_TYPE = {
  POINTS: "points",
  GIFT: "gift",
};

const ENTRY_REWARD_STATUS = {
  PENDING: "pending",
  CREDITED: "credited",
};

const PRODUCT_SCOPE = {
  EVERY_PRODUCT: "EVERY_PRODUCT",
  SELECTED_PRODUCTS: "SELECTED_PRODUCTS",
};

const TIER_SCOPE = {
  ALL_TIERS: "ALL_TIERS",
  SELECTED_TIERS: "SELECTED_TIERS",
};

const CONTEST_FCM_TYPES = {
  CONTEST_WON: "CONTEST_WON",
};

const CONTEST_MESSAGES = {
  CREATED: "Contest created",
  UPDATED: "Contest updated",
  DELETED: "Contest deleted",
  FINALISED: "Contest finalised",
  REWARD_CLAIMED: "Reward claimed successfully!",
};

const CONTEST_ERRORS = {
  CONTEST_NOT_FOUND: "Contest not found",
  ENTRY_NOT_FOUND: "Contest entry not found",
  NOT_COMPLETED: "Contest is not completed yet",
  ALREADY_CLAIMED: "Reward already claimed",
  NO_PRIZE_FOR_RANK: "No prize won for this rank",
};

const CONTEST_CONFIG = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  GENERAL_LEADERBOARD_LIMIT: 100,
};

module.exports = {
  CONTEST_STATUS,
  REWARD_TYPE,
  ENTRY_REWARD_STATUS,
  PRODUCT_SCOPE,
  TIER_SCOPE,
  CONTEST_FCM_TYPES,
  CONTEST_MESSAGES,
  CONTEST_ERRORS,
  CONTEST_CONFIG,
};

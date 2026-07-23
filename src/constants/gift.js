const GIFT_REDEMPTION_STATUS = {
  PROCESSING: "Processing",
  APPROVED: "Approved",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const REWARD_CAUSE = {
  DIRECT_PURCHASE: "DIRECT_PURCHASE",
  CONTEST: "CONTEST",
  SCRATCH_CARD: "SCRATCH_CARD",
  MILESTONE: "MILESTONE",
  CAMPAIGN: "CAMPAIGN",
  ADMIN_GRANT: "ADMIN_GRANT",
};

const SCRATCH_CARD_REWARD_TYPES = {
  COIN: "COIN",
  GIFT: "GIFT",
  BONUS_POINTS: "BONUS_POINTS",
};

const SCRATCH_CARD_MESSAGES = {
  CONFIG_UPDATED: "Scratch card configuration updated successfully",
  RULE_CREATED: "Scratch card rule created successfully",
  RULE_UPDATED: "Scratch card rule updated successfully",
  RULE_DELETED: "Scratch card rule deleted successfully",
};

const SCRATCH_CARD_ERRORS = {
  CONFIG_NOT_FOUND: "App config not found",
  RULE_NOT_FOUND: "Scratch card rule not found",
  PROBABILITY_RANGE: "Probability must be between 0 and 100",
  GIFT_PROBABILITY_RANGE: "Gift probability must be between 0 and 100",
  MIN_MAX_INVALID: "Min bonus points cannot exceed max bonus points",
  INVALID_GIFT_IDS: "One or more selected gift IDs are invalid",
};

module.exports = {
  GIFT_REDEMPTION_STATUS,
  REWARD_CAUSE,
  SCRATCH_CARD_REWARD_TYPES,
  SCRATCH_CARD_MESSAGES,
  SCRATCH_CARD_ERRORS,
};

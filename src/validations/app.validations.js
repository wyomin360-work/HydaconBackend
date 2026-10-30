const { PAYOUT_METHOD_VALUES } = require("../constants/payouts");

const platformVersion = {
  type: "object",
  properties: {
    android: { type: "string", maxLength: 32 },
    ios: { type: "string", maxLength: 32 },
  },
  additionalProperties: false,
};

const appConfigUpdateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", maxLength: 128 },
    currentVersion: { type: "string", maxLength: 32 },
    latestVersion: { type: "string", maxLength: 32 },
    lastUpdated: { type: "string", maxLength: 64 },
    lastUpdatedBy: { type: "string", maxLength: 64 },
    maintenanceMessage: { type: "string", maxLength: 2000 },
    androidUpdateUrl: { type: "string", maxLength: 2048 },
    iosUpdateUrl: { type: "string", maxLength: 2048 },
    isAndroidForceUpdate: { type: "boolean" },
    isIosForceUpdate: { type: "boolean" },
    minimumSupportedVersion: platformVersion,
    updateNotes: {
      type: "object",
      properties: {
        android: { type: "string", maxLength: 2000 },
        ios: { type: "string", maxLength: 2000 },
      },
      additionalProperties: false,
    },
    coinSettings: {
      type: "object",
      properties: {
        coinValue: { type: "number", minimum: 0 },
        minWithdrawAmount: { type: "number", minimum: 0 },
        maxWithdrawAmount: { type: "number", minimum: 0 },
        referralBonus: { type: "number", minimum: 0 },
        pointToCoinRatio: { type: "number", exclusiveMinimum: 0 },
      },
      additionalProperties: false,
    },
    payoutSettings: {
      type: "object",
      properties: {
        defaultPayoutMethod: { type: "string", enum: PAYOUT_METHOD_VALUES },
      },
      additionalProperties: false,
    },
    securitySettings: {
      type: "object",
      properties: {
        scanCountForBan: { type: "number", exclusiveMinimum: 0 },
        autoBanEnabled: { type: "boolean" },
      },
      additionalProperties: false,
    },
    scratchCardSettings: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        probability: { type: "number", minimum: 0, maximum: 100 },
        cooldownMinutes: { type: "number", minimum: 0 },
        maxPerDay: { type: "number", minimum: 0 },
        minBonusPoints: { type: "number", minimum: 0 },
        maxBonusPoints: { type: "number", minimum: 0 },
        giftProbability: { type: "number", minimum: 0, maximum: 100 },
        selectedGiftIds: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
    referralRewards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          requiredScans: { type: "number", minimum: 0 },
          referrerRewardPoints: { type: "number", minimum: 0 },
          refereeRewardPoints: { type: "number", minimum: 0 },
          referrerRewardCoins: { type: "number", minimum: 0 },
          refereeRewardCoins: { type: "number", minimum: 0 },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

module.exports = { appConfigUpdateRequestType };

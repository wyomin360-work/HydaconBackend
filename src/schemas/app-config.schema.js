const { default: mongoose } = require("mongoose");

const platformVersionSchema = new mongoose.Schema(
  {
    android: { type: String, default: "1.0.0" },
    ios: { type: String, default: "1.0.0" },
  },
  { _id: false },
);

const platformNotesSchema = new mongoose.Schema(
  {
    android: { type: String },
    ios: { type: String },
  },
  { _id: false },
);

const coinSettingsSchema = new mongoose.Schema(
  {
    coinValue: { type: Number, required: true },
    minWithdrawAmount: { type: Number, default: 100 },
    maxWithdrawAmount: { type: Number, default: 1000 },
    referralBonus: { type: Number, default: 50 },
    pointToCoinRatio: { type: Number, default: 100 }, // 100 points = 1 coin
  },
  { _id: false },
);

const securitySettingsSchema = new mongoose.Schema(
  {
    scanCountForBan: { type: Number, default: 8 },
    autoBanEnabled: { type: Boolean, default: true },
  },
  { _id: false },
);

const referralRewardsSchema = new mongoose.Schema(
  {
    requiredScans: { type: Number, default: 1 },
    referrerRewardPoints: { type: Number, default: 50 },
    refereeRewardPoints: { type: Number, default: 50 },
  },
  { _id: false },
);

const appConfigSchema = new mongoose.Schema({
  name: { type: String, required: true },
  currentVersion: { type: String, required: true, default: "1.0.0" },
  latestVersion: { type: String, required: true, default: "1.0.0" },
  lastUpdated: { type: Date },
  maintenanceMessage: { type: String },
  androidUpdateUrl: { type: String },
  iosUpdateUrl: { type: String },
  isAndroidForceUpdate: { type: Boolean, default: false },
  isIosForceUpdate: { type: Boolean, default: false },
  minimumSupportedVersion: {
    type: platformVersionSchema,
    default: () => ({}),
  },
  updateNotes: {
    type: platformNotesSchema,
    default: () => ({}),
  },
  coinSettings: {
    type: coinSettingsSchema,
    required: true,
    default: () => ({}),
  },
  securitySettings: {
    type: securitySettingsSchema,
    default: () => ({}),
  },
  referralRewards: {
    type: [referralRewardsSchema],
    required: true,
    default: () => [],
  },
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
});

const AppConfig = mongoose.model("AppConfig", appConfigSchema);
module.exports = AppConfig;

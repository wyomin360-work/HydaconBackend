const { default: mongoose } = require("mongoose");

const platformVersionSchema = new mongoose.Schema(
  {
    android: { type: String, default: "1.0.0" },
    ios: { type: String, default: "1.0.0" },
  },
  { _id: false }
);

const platformNotesSchema = new mongoose.Schema(
  {
    android: { type: String },
    ios: { type: String },
  },
  { _id: false }
);

const coinSettingsSchema = new mongoose.Schema(
  {
    coinValue: { type: Number, required: true },
    minWithdrawAmount: { type: Number, default: 100 },
    maxWithdrawAmount: { type: Number, default: 1000 },
    referralBonus: { type: Number, default: 50 },
  },
  { _id: false }
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
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
});

const AppConfig = mongoose.model("AppConfig", appConfigSchema);
module.exports = AppConfig;

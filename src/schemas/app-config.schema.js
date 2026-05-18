const { default: mongoose } = require("mongoose");

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
    android: { type: String, default: "1.0.0" },
    ios: { type: String, default: "1.0.0" },
  },
  updateNotes: {
    android: { type: String },
    ios: { type: String },
  },
  coinSettings: {
    coinValue: { type: Number, required: true },
    minWithdrawAmount: { type: Number, default: 100 },
    maxWithdrawAmount: { type: Number, default: 1000 },
    referralBonus: { type: Number, default: 50 },
  },
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
});

const AppConfig = mongoose.model("AppConfig", appConfigSchema);
module.exports = AppConfig;

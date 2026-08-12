const { default: mongoose } = require("mongoose");

const refreshTokenSchema = new mongoose.Schema({
  refreshToken: { type: String, required: true },
  userId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  issuedAt: { type: Date, default: Date.now },
  revoked: { type: Boolean, default: false },
});

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
module.exports = RefreshToken;

const { ROLES } = require("../../constants/common");
const Admin = require("../../schemas/admin.schema");
const RefreshToken = require("../../schemas/refreshtoken.schema");
const User = require("../../schemas/user.schema");
const moment = require("moment");
const { verifyToken, generateToken } = require("../../utils/heplers");
const { sendFailResponse } = require("../../utils/responseHandlers");

async function uploadImage(file) {
  if (!file) sendFailResponse("The file not received");
  const host =
    process.env.NODE_ENV === "dev"
      ? `http://localhost:${process.env.PORT || 3000}`
      : "https://hydaconbackend.onrender.com";
  const fileUrl = `${host}/uploads/images/${file?.filename}`;
  return { data: { url: fileUrl } };
}

async function renewToken(data) {
  const { currentRefreshToken, role } = data;

  const now = moment();
  const refreshTokenTokenExpiryIn = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  );

  const tokenDetails = verifyToken(currentRefreshToken);
  if (!tokenDetails) sendFailResponse("Authentication Expired", 401);

  if (role === ROLES.USER) {
    const user = await User.findById(tokenDetails?.userId);
    if (!user) sendFailResponse("Corrupted token", 401);

    const storedToken = await RefreshToken.findOne({
      refreshToken: currentRefreshToken,
      userId: tokenDetails?.userId,
    });

    if (!storedToken) {
      sendFailResponse("Token manipulated", 401);
    }

    if (storedToken.revoked) {
      // Token reuse detected! Revoke all tokens for this user.
      await RefreshToken.deleteMany({ userId: user._id });
      sendFailResponse("Token compromised. Please log in again.", 403);
    }

    let payload = {
      userId: user._id,
      email: user.email,
    };
    
    // Generate new token pair
    const accessToken = generateToken(payload, "15m");
    const refreshToken = generateToken(payload, "7d");

    // Revoke old token
    storedToken.revoked = true;
    await storedToken.save();

    // Create new refresh token
    await RefreshToken.create({
      refreshToken,
      userId: payload?.userId,
      expiresAt: refreshTokenTokenExpiryIn,
    });

    user.refreshToken = refreshToken;
    user.accessToken = accessToken;
    await user.save();
    
    return { accessToken, refreshToken };
  } else if (role === ROLES.ADMIN) {
    const admin = await Admin.findById(tokenDetails?.adminId);
    if (!admin) sendFailResponse("Corrupted token", 401);

    const storedToken = await RefreshToken.findOne({
      refreshToken: currentRefreshToken,
      userId: tokenDetails?.adminId,
    });

    if (!storedToken) {
      sendFailResponse("Token manipulated", 401);
    }

    if (storedToken.revoked) {
      // Token reuse detected! Revoke all tokens for this admin.
      await RefreshToken.deleteMany({ userId: admin._id });
      sendFailResponse("Token compromised. Please log in again.", 403);
    }

    let payload = {
      adminId: admin._id,
      email: admin.email,
    };

    // Generate new token pair
    const accessToken = generateToken(payload, "15m");
    const refreshToken = generateToken(payload, "7d");

    // Revoke old token
    storedToken.revoked = true;
    await storedToken.save();

    // Create new refresh token
    await RefreshToken.create({
      refreshToken,
      userId: payload?.adminId,
      expiresAt: refreshTokenTokenExpiryIn,
    });

    admin.refreshToken = refreshToken;
    admin.accessToken = accessToken;
    await admin.save();
    
    return { accessToken, refreshToken };
  } else {
    sendFailResponse("Invalid token", 401);
  }
}

module.exports = {
  uploadImage,
  renewToken,
};

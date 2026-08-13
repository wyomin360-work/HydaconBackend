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
  const { currentRefreshToken, currentAccessToken, role } = data;

  if (!currentRefreshToken || !currentAccessToken) {
    sendFailResponse("Refresh token and access token are required", 400);
  }

  const storedToken = await RefreshToken.findOne({ refreshToken: currentRefreshToken });
  if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
    sendFailResponse("Invalid or expired refresh token. Please login again.", 401);
  }

  const jwt = require("jsonwebtoken");
  const decodedAccess = jwt.decode(currentAccessToken);
  
  if (!decodedAccess) {
    sendFailResponse("Invalid access token", 400);
  }

  let userOrAdmin;
  if (role === ROLES.USER) {
    userOrAdmin = await User.findById(decodedAccess.userId);
  } else if (role === ROLES.ADMIN) {
    userOrAdmin = await Admin.findById(decodedAccess.adminId);
  } else {
    sendFailResponse("Invalid role", 400);
  }

  if (!userOrAdmin) {
    sendFailResponse("User or admin not found", 401);
  }

  if (decodedAccess.accessTokenVersion !== userOrAdmin.accessTokenVersion) {
    storedToken.revoked = true;
    await storedToken.save();
    sendFailResponse("Session revoked. Please login again.", 401);
  }

  await RefreshToken.findByIdAndDelete(storedToken._id);

  userOrAdmin.accessTokenVersion = (userOrAdmin.accessTokenVersion || 0) + 1;
  await userOrAdmin.save();

  const accessPayload = {
    email: userOrAdmin.email,
    accessTokenVersion: userOrAdmin.accessTokenVersion,
  };
  
  const refreshPayload = {
    email: userOrAdmin.email,
    tokenVersion: userOrAdmin.tokenVersion,
  };
  
  if (role === ROLES.USER) {
    accessPayload.userId = userOrAdmin._id;
    refreshPayload.userId = userOrAdmin._id;
  } else {
    accessPayload.adminId = userOrAdmin._id;
    refreshPayload.adminId = userOrAdmin._id;
  }

  const newAccessToken = generateToken(accessPayload, "30m");
  const newRefreshToken = generateToken(refreshPayload, "60d");
  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  await RefreshToken.create({
    userId: userOrAdmin._id,
    refreshToken: newRefreshToken,
    expiresAt,
  });

  return { 
    message: "Token refreshed successfully",
    data: { accessToken: newAccessToken, refreshToken: newRefreshToken }
  };
}

module.exports = {
  uploadImage,
  renewToken,
};

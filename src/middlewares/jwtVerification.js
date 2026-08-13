const jwt = require("jsonwebtoken");
const { sendFailResponse } = require("../utils/responseHandlers");
const { verifyToken, generateToken } = require("../utils/heplers");
const Admin = require("../schemas/admin.schema");
const User = require("../schemas/user.schema");
const { ROLES } = require("../constants/common");

const secretKey = process.env.JWT_SECRET;

async function verifyUser(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendFailResponse("Authorization token missing", 401);
  }

  const token = authHeader.split(" ")[1];
  const verifiedToken = verifyToken(token);

  if (!verifiedToken) sendFailResponse("Token Expired", 401);

  const user = await User.findById(verifiedToken.userId);
  if (!user) sendFailResponse("User not found", 404);

  if (verifiedToken.accessTokenVersion !== user.accessTokenVersion) {
    sendFailResponse("Token has been revoked. Please login again.", 401);
  }

  // Auto-renew token if expiring in less than 5 minutes (300 seconds)
  const currentTime = Math.floor(Date.now() / 1000);
  const timeRemaining = verifiedToken.exp - currentTime;

  if (timeRemaining < 300) {
    user.accessTokenVersion = (user.accessTokenVersion || 0) + 1;
    await user.save();

    const payload = {
      userId: user._id,
      email: user.email,
      accessTokenVersion: user.accessTokenVersion,
    };
    const newToken = generateToken(payload, "15m");
    res.setHeader("x-renewed-token", newToken);
    res.setHeader("Access-Control-Expose-Headers", "x-renewed-token");
  }

  req.userId = verifiedToken?.userId;
  req.user = user;
  next();
}

async function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendFailResponse("Authorization token missing", 401);
    return;
  }

  const token = authHeader.split(" ")[1];
  const verifiedToken = verifyToken(token);
  if (!verifiedToken) {
    sendFailResponse("Token Expired", 401);
    return;
  }

  const admin = await Admin.findById(verifiedToken.adminId);
  if (!admin) {
    sendFailResponse("Admin not found", 404);
    return;
  }

  if (verifiedToken.accessTokenVersion !== admin.accessTokenVersion) {
    sendFailResponse("Token has been revoked. Please login again.", 401);
    return;
  }

  // Auto-renew token if expiring in less than 5 minutes (300 seconds)
  const currentTime = Math.floor(Date.now() / 1000);
  const timeRemaining = verifiedToken.exp - currentTime;

  if (timeRemaining < 300) {
    admin.accessTokenVersion = (admin.accessTokenVersion || 0) + 1;
    await admin.save();

    const payload = {
      adminId: admin._id,
      email: admin.email,
      accessTokenVersion: admin.accessTokenVersion,
    };
    const newToken = generateToken(payload, "15m");
    res.setHeader("x-renewed-token", newToken);
    res.setHeader("Access-Control-Expose-Headers", "x-renewed-token");
  }

  req.userId = verifiedToken?.adminId;
  req.admin = admin;
  next();
}

async function verifyAdminOrUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendFailResponse("Authorization token missing", 401);
    return;
  }

  const token = authHeader.split(" ")[1];

  const verifiedToken = verifyToken(token);

  if (!verifiedToken) {
    sendFailResponse("Token Expired", 401);
    return;
  }

  let entity = await Admin.findById(verifiedToken.adminId);
  if (entity) {
    if (verifiedToken.accessTokenVersion !== entity.accessTokenVersion) {
      sendFailResponse("Token has been revoked. Please login again.", 401);
      return;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeRemaining = verifiedToken.exp - currentTime;

    if (timeRemaining < 300) {
      entity.accessTokenVersion = (entity.accessTokenVersion || 0) + 1;
      await entity.save();

      const payload = {
        adminId: entity._id,
        email: entity.email,
        accessTokenVersion: entity.accessTokenVersion,
      };
      const newToken = generateToken(payload, "15m");
      res.setHeader("x-renewed-token", newToken);
      res.setHeader("Access-Control-Expose-Headers", "x-renewed-token");
    }

    req.userId = verifiedToken.adminId;
    req.admin = entity;
    req.role = ROLES.ADMIN;
    return next();
  }

  entity = await User.findById(verifiedToken.userId);
  if (entity) {
    if (verifiedToken.accessTokenVersion !== entity.accessTokenVersion) {
      sendFailResponse("Token has been revoked. Please login again.", 401);
      return;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeRemaining = verifiedToken.exp - currentTime;

    if (timeRemaining < 300) {
      entity.accessTokenVersion = (entity.accessTokenVersion || 0) + 1;
      await entity.save();

      const payload = {
        userId: entity._id,
        email: entity.email,
        accessTokenVersion: entity.accessTokenVersion,
      };
      const newToken = generateToken(payload, "15m");
      res.setHeader("x-renewed-token", newToken);
      res.setHeader("Access-Control-Expose-Headers", "x-renewed-token");
    }

    req.userId = verifiedToken.userId;
    req.user = entity;
    req.role = ROLES.USER;
    return next();
  }

  return sendFailResponse("User or Admin not found", 404);
}

module.exports = { verifyUser, verifyAdmin, verifyAdminOrUser };

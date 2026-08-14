const jwt = require("jsonwebtoken");
const { sendFailResponse } = require("../utils/responseHandlers");
const { verifyToken, generateToken } = require("../utils/heplers");
const Admin = require("../schemas/admin.schema");
const User = require("../schemas/user.schema");
const RefreshToken = require("../schemas/refreshtoken.schema");
const { ROLES } = require("../constants/common");

const secretKey = process.env.JWT_SECRET;

async function verifyUser(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendFailResponse("Authorization token missing", 401);
  }

  const token = authHeader.split(" ")[1];
  let verifiedToken;
  try {
    verifiedToken = jwt.verify(token, secretKey);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      verifiedToken = jwt.verify(token, secretKey, { ignoreExpiration: true });
    } else {
      return sendFailResponse("Not authorized to access this route", 401);
    }
  }

  const user = await User.findById(verifiedToken.userId);
  if (!user) return sendFailResponse("User not found", 404);

  if (verifiedToken.accessTokenVersion !== user.accessTokenVersion) {
    return sendFailResponse("Token has been revoked. Please login again.", 401);
  }

  // Auto-renew token if expiring in less than 5 minutes (300 seconds)
  const currentTime = Math.floor(Date.now() / 1000);
  const timeRemaining = verifiedToken.exp - currentTime;

  if (timeRemaining < 300) {
    const activeRefreshToken = await RefreshToken.findOne({
      userId: user._id,
      revoked: false,
      expiresAt: { $gt: new Date() },
    });

    if (!activeRefreshToken) {
      if (timeRemaining < 0) {
        return sendFailResponse("Session expired. Please login again.", 401);
      }
    } else {
      const payload = {
        userId: user._id,
        email: user.email,
        accessTokenVersion: user.accessTokenVersion,
      };
      const newToken = generateToken(payload, "30m");
      res.setHeader("x-renewed-token", newToken);
      res.setHeader("Access-Control-Expose-Headers", "x-renewed-token");
    }
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
  let verifiedToken;
  try {
    verifiedToken = jwt.verify(token, secretKey);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      verifiedToken = jwt.verify(token, secretKey, { ignoreExpiration: true });
    } else {
      return sendFailResponse("Not authorized to access this route", 401);
    }
  }

  const admin = await Admin.findById(verifiedToken.adminId);
  if (!admin) {
    return sendFailResponse("Admin not found", 404);
  }

  if (verifiedToken.accessTokenVersion !== admin.accessTokenVersion) {
    return sendFailResponse("Token has been revoked. Please login again.", 401);
  }

  // Auto-renew token if expiring in less than 5 minutes (300 seconds)
  const currentTime = Math.floor(Date.now() / 1000);
  const timeRemaining = verifiedToken.exp - currentTime;

  if (timeRemaining < 300) {
    const activeRefreshToken = await RefreshToken.findOne({
      userId: admin._id,
      revoked: false,
      expiresAt: { $gt: new Date() },
    });

    if (!activeRefreshToken) {
      if (timeRemaining < 0) {
        return sendFailResponse("Session expired. Please login again.", 401);
      }
    } else {
      const payload = {
        adminId: admin._id,
        email: admin.email,
        accessTokenVersion: admin.accessTokenVersion,
      };
      const newToken = generateToken(payload, "30m");
      res.setHeader("x-renewed-token", newToken);
      res.setHeader("Access-Control-Expose-Headers", "x-renewed-token");
    }
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

  let verifiedToken;
  try {
    verifiedToken = jwt.verify(token, secretKey);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      verifiedToken = jwt.verify(token, secretKey, { ignoreExpiration: true });
    } else {
      return sendFailResponse("Not authorized to access this route", 401);
    }
  }

  let entity = await Admin.findById(verifiedToken.adminId);
  if (entity) {
    if (verifiedToken.accessTokenVersion !== entity.accessTokenVersion) {
      return sendFailResponse("Token has been revoked. Please login again.", 401);
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeRemaining = verifiedToken.exp - currentTime;

    if (timeRemaining < 300) {
      const activeRefreshToken = await RefreshToken.findOne({
        userId: entity._id,
        revoked: false,
        expiresAt: { $gt: new Date() },
      });

      if (!activeRefreshToken) {
        if (timeRemaining < 0) {
          return sendFailResponse("Session expired. Please login again.", 401);
        }
      } else {
        const payload = {
          adminId: entity._id,
          email: entity.email,
          accessTokenVersion: entity.accessTokenVersion,
        };
        const newToken = generateToken(payload, "30m");
        res.setHeader("x-renewed-token", newToken);
        res.setHeader("Access-Control-Expose-Headers", "x-renewed-token");
      }
    }

    req.userId = verifiedToken.adminId;
    req.admin = entity;
    req.role = ROLES.ADMIN;
    return next();
  }

  entity = await User.findById(verifiedToken.userId);
  if (entity) {
    if (verifiedToken.accessTokenVersion !== entity.accessTokenVersion) {
      return sendFailResponse("Token has been revoked. Please login again.", 401);
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeRemaining = verifiedToken.exp - currentTime;

    if (timeRemaining < 300) {
      const activeRefreshToken = await RefreshToken.findOne({
        userId: entity._id,
        revoked: false,
        expiresAt: { $gt: new Date() },
      });

      if (!activeRefreshToken) {
        if (timeRemaining < 0) {
          return sendFailResponse("Session expired. Please login again.", 401);
        }
      } else {
        const payload = {
          userId: entity._id,
          email: entity.email,
          accessTokenVersion: entity.accessTokenVersion,
        };
        const newToken = generateToken(payload, "15m");
        res.setHeader("x-renewed-token", newToken);
        res.setHeader("Access-Control-Expose-Headers", "x-renewed-token");
      }
    }

    req.userId = verifiedToken.userId;
    req.user = entity;
    req.role = ROLES.USER;
    return next();
  }

  return sendFailResponse("User or Admin not found", 404);
}

module.exports = { verifyUser, verifyAdmin, verifyAdminOrUser };

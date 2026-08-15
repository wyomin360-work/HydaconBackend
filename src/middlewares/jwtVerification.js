const jwt = require("jsonwebtoken");
const { sendFailResponse } = require("../utils/responseHandlers");
const { generateToken } = require("../utils/heplers");
const Admin = require("../schemas/admin.schema");
const User = require("../schemas/user.schema");
const RefreshToken = require("../schemas/refreshtoken.schema");
const { ROLES } = require("../constants/common");

const secretKey = process.env.JWT_SECRET;

/**
 * Helper to extract and verify JWT from Authorization header.
 * Throws AppError via sendFailResponse if invalid or missing.
 */
function extractAndVerifyToken(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendFailResponse("Authorization token missing", 401);
  }

  const token = authHeader.split(" ")[1];
  try {
    return jwt.verify(token, secretKey);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return jwt.verify(token, secretKey, { ignoreExpiration: true });
    }
    return sendFailResponse("Not authorized to access this route", 401);
  }
}

/**
 * Helper to validate entity (User or Admin) from payload, check version, handle auto-renewal, and attach to req.
 */
async function authenticateEntity(req, res, verifiedToken, Model, idClaim, entityKey, expiresIn = "30m") {
  const entityId = verifiedToken[idClaim];
  if (!entityId) return null;

  const entity = await Model.findById(entityId);
  if (!entity) return null;

  if (verifiedToken.accessTokenVersion !== entity.accessTokenVersion) {
    return sendFailResponse("Token has been revoked. Please login again.", 401);
  }

  // Auto-renew token if expiring in less than 5 minutes (300 seconds)
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
        [idClaim]: entity._id,
        email: entity.email,
        accessTokenVersion: entity.accessTokenVersion,
      };
      const newToken = generateToken(payload, expiresIn);
      res.setHeader("x-renewed-token", newToken);
      res.setHeader("Access-Control-Expose-Headers", "x-renewed-token");
    }
  }

  req.userId = entityId;
  req[entityKey] = entity;
  return entity;
}

async function verifyUser(req, res, next) {
  const verifiedToken = extractAndVerifyToken(req);
  const user = await authenticateEntity(req, res, verifiedToken, User, "userId", "user", "30m");
  if (!user) return sendFailResponse("User not found", 404);
  next();
}

async function verifyAdmin(req, res, next) {
  const verifiedToken = extractAndVerifyToken(req);
  const admin = await authenticateEntity(req, res, verifiedToken, Admin, "adminId", "admin", "30m");
  if (!admin) return sendFailResponse("Admin not found", 404);
  next();
}

async function verifyAdminOrUser(req, res, next) {
  const verifiedToken = extractAndVerifyToken(req);

  const admin = await authenticateEntity(req, res, verifiedToken, Admin, "adminId", "admin", "30m");
  if (admin) {
    req.role = ROLES.ADMIN;
    return next();
  }

  const user = await authenticateEntity(req, res, verifiedToken, User, "userId", "user", "15m");
  if (user) {
    req.role = ROLES.USER;
    return next();
  }

  return sendFailResponse("User or Admin not found", 404);
}

module.exports = { verifyUser, verifyAdmin, verifyAdminOrUser };

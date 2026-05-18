const jwt = require("jsonwebtoken");
const { sendFailResponse } = require("../utils/responseHandlers");
const { verifyToken } = require("../utils/heplers");
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

  req.userId = verifiedToken?.userId;
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

  req.userId = verifiedToken?.adminId;
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
    req.userId = verifiedToken.adminId;
    req.role = ROLES.ADMIN;
    return next();
  }

  entity = await User.findById(verifiedToken.userId);
  if (entity) {
    req.userId = verifiedToken.userId;
    req.role = ROLES.USER;
    return next();
  }

  return sendFailResponse("User or Admin not found", 404);
}

module.exports = { verifyUser, verifyAdmin, verifyAdminOrUser };

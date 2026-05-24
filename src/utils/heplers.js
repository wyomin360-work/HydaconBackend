const bcrypt = require("bcrypt");
const { randomBytes } = require("crypto");
const jwt = require("jsonwebtoken");

// const JWT_SECRET = process.env.JWT_SECRET;

const handleError = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// BCRYPT
const hashData = async (rawData, salt = 10) => {
  try {
    return await bcrypt.hash(rawData, salt);
  } catch (error) {
    console.error("Error  hashing data", error);
    return false;
  }
};

const compareHash = async (rawData, hashedData) => {
  try {
    return await bcrypt.compare(rawData, hashedData);
  } catch (error) {
    console.error("Error comparing hash:", error);
    return false;
  }
};

// JWT

const generateToken = (payload, expiresIn = "1d") => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

const verifyToken = (token) => {
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    return verified;
  } catch (err) {
    return false;
  }
};

const generateRandomPassword = (length) => {
  const upperCaseChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowerCaseChars = "abcdefghijklmnopqrstuvwxyz";
  const numberChars = "0123456789";
  const specialChars = "!@#$%^&*()_-+=<>?";

  const allChars = upperCaseChars + lowerCaseChars + numberChars + specialChars;
  let password = "";

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * allChars.length);
    password += allChars[randomIndex];
  }

  return password;
};

// Generate a random 4-character hex string
const randomHex = () =>
  Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");

const generateBufferToken = (count = 32) => {
  const buffer = randomBytes(count);
  return buffer.toString("hex");
};

function attachId(doc) {
  if (Array.isArray(doc)) {
    return doc.map((d) => ({ ...d, id: d._id }));
  }
  return { ...doc, id: doc._id };
}

const generateOtp = (length) => {
  return Array(length)
    .fill(0)
    .map(() => Math.floor(Math.random() * 10))
    .join("");
};

function formatNotification(template, data) {
  return template.replace(/{{(.*?)}}/g, (_, key) => {
    return data[key.trim()]?.toString() || "";
  });
}

module.exports = {
  handleError,
  hashData,
  verifyToken,
  generateToken,
  compareHash,
  randomHex,
  attachId,
  generateOtp,
  generateBufferToken,
  generateRandomPassword,
  formatNotification,
};

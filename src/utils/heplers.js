const bcrypt = require("bcrypt");
const { randomBytes } = require("crypto");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

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
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

const verifyToken = (token) => {
  try {
    const verified = jwt.verify(token, JWT_SECRET);
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

const calculateProfileCompletion = (user, roleName = "") => {
  let totalFields = 10;
  let filledFields = 0;

  // 1. Email
  if (user.email) filledFields++;
  
  // 2. Name
  if (user.name) filledFields++;
  
  // 3. Mobile Number (phonenumber)
  if (user.mobileNumber) filledFields++;
  
  // 4. Date of Birth
  if (user.dob) filledFields++;
  
  // 5. Profile Photo
  if (user.profilePhoto) filledFields++;
  
  // 6. Experience
  if (user.experience !== undefined && user.experience !== null) filledFields++;
  
  // 7. Area of Operation
  if (user.areaOfOperation) filledFields++;
  
  // 8. KYC Status
  if (user.kycStatus && user.kycStatus !== 'NOT_STARTED') filledFields++;
  
  // 9. Bank Details (must contain accountNumber, ifscCode, and userName)
  const hasBankDetails = user.bankDetails && 
                         user.bankDetails.accountNumber && 
                         user.bankDetails.ifscCode && 
                         user.bankDetails.userName;
  if (hasBankDetails) filledFields++;
  
  // 10. Agreed to Terms
  if (user.agreedToTerms === true) filledFields++;

  if (roleName === 'retailer') {
    totalFields = 11;
    // 11. Shop Name
    if (user.shopName) filledFields++;
  }

<<<<<<< HEAD
  return Math.round((filledFields / totalFields) * 100);
};
=======
  return [...variants];
}
function parseUserAgent(userAgent, headers = {}) {
  const info = {
    userAgent: userAgent || null,
    deviceId: headers["x-device-id"] || headers["device-id"] || null,
    platform: headers["x-platform"] || headers["sec-ch-ua-platform"] || null,
    appVersion: headers["x-app-version"] || null,
    deviceName: null,
  };

  if (!userAgent) return info;

  const appVersionMatch = userAgent.match(/(?:Hybeck-[a-zA-Z]+|App)\/([\d.]+)/i);
  if (appVersionMatch && !info.appVersion) {
    info.appVersion = appVersionMatch[1];
  }

  const parenMatch = userAgent.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const parts = parenMatch[1].split(";").map(p => p.trim());
    const isAndroid = parts.some(p => /android/i.test(p)) || /android/i.test(userAgent);
    const isIOS = parts.some(p => /iphone|ipad|ipod/i.test(p)) || /iphone|ipad|ipod/i.test(userAgent);

    if (isAndroid) {
      if (!info.platform) info.platform = "Android";
      const devicePart = parts.find(p => 
        !/linux/i.test(p) && 
        !/android/i.test(p) && 
        !/build/i.test(p) &&
        !/applewebkit/i.test(p)
      );
      if (devicePart) {
        info.deviceName = devicePart;
      }
    } else if (isIOS) {
      if (!info.platform) info.platform = "iOS";
      const devicePart = parts.find(p => /iphone|ipad|ipod/i.test(p));
      if (devicePart) {
        info.deviceName = devicePart;
      }
    } else {
      if (/macintosh/i.test(userAgent)) {
        if (!info.platform) info.platform = "macOS";
        info.deviceName = "Macintosh";
      } else if (/windows/i.test(userAgent)) {
        if (!info.platform) info.platform = "Windows";
        info.deviceName = "Windows PC";
      } else if (/linux/i.test(userAgent)) {
        if (!info.platform) info.platform = "Linux";
        info.deviceName = "Linux PC";
      }
    }
  }

  if (!info.deviceName) {
    const modelMatch = userAgent.match(/(RMX\d+|SM-\w+|iPhone\d+,\d+|iPad\d+,\d+)/i);
    if (modelMatch) {
      info.deviceName = modelMatch[1];
    }
  }

  if (!info.deviceId && info.deviceName) {
    info.deviceId = `DEV-${info.deviceName.replace(/\s+/g, '-')}`;
  }

  return info;
}
>>>>>>> e5638921cd1e3106bb7b78c95c22590fd5d27769

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
<<<<<<< HEAD
  calculateProfileCompletion,
=======
  buildPhoneLookupVariants,
  parseUserAgent,
>>>>>>> e5638921cd1e3106bb7b78c95c22590fd5d27769
};

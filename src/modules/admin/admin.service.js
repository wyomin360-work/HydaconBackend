const crypto = require("crypto");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const Admin = require("../../schemas/admin.schema");
const AuditLog = require("../../schemas/audit-log.schema");
const { AUDIT_LOG_ACTIONS } = require("../../constants/audit-logs");
const RefreshToken = require("../../schemas/refreshtoken.schema");
const User = require("../../schemas/user.schema");
const {
  sendFailResponse,
  sendResponse,
} = require("../../utils/responseHandlers");
const { compareHash, generateToken, parseUserAgent } = require("../../utils/heplers");
const { sendMail } = require("../../functions/nodemailer");

async function generateAndSaveToken(payload) {
  const accessToken = generateToken(payload);
  const refreshToken = generateToken(payload, "30d");
  const refreshTokenTokenExpiryIn = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  );

  if (!refreshToken || !accessToken)
    sendFailResponse("Failed to generate token");

  await RefreshToken.create({
    refreshToken,
    userId: payload?.adminId,
    expiresAt: refreshTokenTokenExpiryIn, //30 days
  });
  return { accessToken, refreshToken };
}

// // ----------------------
// // Register Admin
// // ----------------------
// async function registerAdmin(adminData, createdBy) {
//     const { name, email, password } = adminData;

//     const adminExist = await Admin.findOne({ email });
//     if (adminExist) sendFailResponse('The mail id exist');

//     const newAdminData = {
//         name,
//         email,
//         password,
//     };

//     if (createdBy) {
//         newAdminData.createdBy = createdBy;
//     }

//     const admin = await Admin.create(newAdminData);

//     const { refreshToken, accessToken } = await generateAndSaveToken({
//         adminId: admin?._id,
//         email: admin?.email,
//     });

//     const { password: pw, ...rest } = admin.toObject();

//     return {
//         message: 'Registration successful',
//         data: { ...rest, accessToken, refreshToken },
//     };
// }

// ----------------------
// Register Admin
// ----------------------
async function registerAdmin(adminData, createdBy) {
  const { name, email, password } = adminData;

  // 1️⃣ Check if admin already exists
  const adminExist = await Admin.findOne({ email });
  if (adminExist) sendFailResponse("The mail id exist");

  // 2️⃣ Create new admin
  const newAdminData = { name, email, password };
  if (createdBy) newAdminData.createdBy = createdBy;

  const admin = await Admin.create(newAdminData);

  // 3️⃣ Generate tokens
  const { refreshToken, accessToken } = await generateAndSaveToken({
    adminId: admin._id,
    email: admin.email,
  });

  const { password: pw, ...rest } = admin.toObject();

  // 4️⃣ Send Welcome Email
  const mailOptions = {
    from: process.env.GOOGLE_USER_MAIL,
    to: admin.email, // the newly registered admin
    subject: "Welcome to Hydacon Admin Panel 🎉",
    text: `Hello ${admin.name},

Your admin account has been created successfully.

Login Credentials:
Email: ${admin.email}
Password: ${password}

You can log in at: ${process.env.FRONTEND_URL || "http://localhost:3000"}/admin/login

⚠️ Please change your password after your first login.

Regards,
Hydacon Team`,
  };

  try {
    const mailInfo = await sendMail(mailOptions);
    console.log(
      "📨 Welcome mail sent to:",
      admin.email,
      " | Message ID:",
      mailInfo?.messageId,
    );
  } catch (error) {
    console.error("⚠️ Failed to send welcome email:", error.message);
  }

  // 5️⃣ Return response
  return {
    message: "Registration successful",
    data: { ...rest, accessToken, refreshToken },
  };
}

// ----------------------
// Login Admin
// ----------------------
async function login(adminData) {
  const { email, password } = adminData;

  const existingAdmin = await Admin.findOne({ email }).lean();

  if (!existingAdmin) sendFailResponse("Invalid Data");

  const isSamePassword = await compareHash(password, existingAdmin.password);
  if (!isSamePassword) sendFailResponse("PassWord mismatch");

  const { refreshToken, accessToken } = await generateAndSaveToken({
    adminId: existingAdmin?._id,
    email: existingAdmin?.email,
  });

  const { password: pw, ...rest } = existingAdmin;

  return {
    message: "Login success",
    data: { ...rest, accessToken, refreshToken },
  };
}

// ----------------------
// Logout Admin
// ----------------------
async function logout(adminId) {
  await RefreshToken.findOneAndDelete({ userId: adminId });
  return { message: "Logged Out successfully", data: { loggedOut: true } };
}

// ----------------------
// Generate Forgot Password Token & Send Email
// ----------------------
async function forgotPassword(email) {
  const admin = await Admin.findOne({ email });
  if (!admin) sendFailResponse("Admin not found with this email");

  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour

  admin.resetPasswordToken = resetToken;
  admin.resetPasswordExpires = resetTokenExpiry;
  await admin.save();

  const resetUrl = `${process.env.FRONTEND_URL}/admin/reset-password/${resetToken}`;

  //  Instead of sending email, just for testing
  console.log("Password Reset Link:", resetUrl);

  const mailOptions = {
    from: `"Hydacon Support" <${process.env.SEND_GRID_FROM_MAIL}>`,
    to: admin.email,
    subject: "Otp for forgot password",
    text: `Greetings from Hydacon , To reset your password click the link ${resetUrl}`,
  };

  const mailSent = await sendMail(mailOptions);
  if (!mailSent) sendFailResponse("Failed to sent mail , try again");

  return {
    message: "Password reset link generated",
    resetToken,
  };
}

// ----------------------
// Reset Password using token
// ----------------------
async function resetPassword(token, newPassword) {
  const admin = await Admin.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() }, // token still valid
  });

  if (!admin) sendFailResponse("Invalid or expired reset token");

  admin.password = newPassword;
  admin.resetPasswordToken = undefined;
  admin.resetPasswordExpires = undefined;

  await admin.save();

  return { message: "Password reset successfully" };
}

// ----------------------
// Update Admin Details (name & password)
// ----------------------
async function updateDetails(adminId, updateData) {
  const { name, oldPassword, newPassword } = updateData;

  const admin = await Admin.findById(adminId);
  if (!admin) sendFailResponse("Admin not found");
  if (name) {
    admin.name = name;
  }
  if (oldPassword && newPassword) {
    const isMatch = await compareHash(oldPassword, admin.password);
    if (!isMatch) sendFailResponse("Old password is incorrect");

    admin.password = newPassword;
  }
  await admin.save();
  const { password, ...rest } = admin.toObject();
  return {
    message: "Admin details updated successfully",
    data: rest,
  };
}

// ----------------------
// Admin List
// ----------------------
async function adminList(data) {
  const {
    page = 1,
    limit = 10,
    search = "",
    sortBy = "createdAt",
    sortOrder = "desc",
    filters = {},
  } = data;

  const skip = (page - 1) * limit;

  let query = {};
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  if (filters.authType) {
    query.authType = filters.authType;
  }
  if (filters.enableNotification !== undefined) {
    query.enableNotification = filters.enableNotification;
  }
  if (filters.agreedToTerms !== undefined) {
    query.agreedToTerms = filters.agreedToTerms;
  }
  if (filters.minPoints !== undefined || filters.maxPoints !== undefined) {
    query.totalPoints = {};
    if (filters.minPoints !== undefined)
      query.totalPoints.$gte = Number(filters.minPoints);
    if (filters.maxPoints !== undefined)
      query.totalPoints.$lte = Number(filters.maxPoints);
  }

  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  // ✅ Use Admin instead of User
  const admins =
    (await Admin.find(query).sort(sort).skip(skip).limit(limit).lean()) ?? [];

  const totalAdmins = await Admin.countDocuments(query);

  return {
    data: {
      admins, // changed from users -> admins
      limit,
      totalPages: Math.ceil(totalAdmins / limit),
      total: totalAdmins,
      page,
    },
  };
}

// ----------------------
// Admin Delete
// ----------------------
async function adminDelete(adminId) {
  await Admin.findByIdAndDelete(adminId);
  return { message: "reward deleted", data: { adminDeleted: true } };
}

// ----------------------
// Phone Number Change Audit Logs
// ----------------------
async function phoneNumberChangeAuditLogs(data = {}) {
  const {
    page = 1,
    limit = 10,
    search = "",
    sortBy = "timestamp",
    sortOrder = "desc",
    filters = {},
  } = data;

  const currentPage = Math.max(Number(page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const safeFilters = filters || {};
  const skip = (currentPage - 1) * pageSize;

  // 1. Define base action requirements
  const baseConditions = {
    $or: [
      { action: "PHONE_NUMBER_CHANGE" },
      { action: { $exists: false } },
      { action: null },
    ],
  };

  // 2. Initialize query with base conditions
  const query = { $and: [baseConditions] };

  // 3. Add Search
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const emailRegex = search.includes("@")
      ? new RegExp(escapedSearch, "i")
      : new RegExp(escapedSearch + "[^@]*@", "i");

    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: emailRegex },
        { phone: { $regex: search, $options: "i" } },
      ],
    }).select("_id").lean();

    const userIds = matchingUsers.map((u) => u._id);

    const searchConditions = [
      { oldNumber: { $regex: search, $options: "i" } },
      { newNumber: { $regex: search, $options: "i" } },
    ];

    if (userIds.length > 0) {
      searchConditions.push({ userId: { $in: userIds } });
    }

    query.$and.push({ $or: searchConditions });
  }

  // 4. Add additional filters
  if (safeFilters.userId) {
    query.$and.push({ userId: safeFilters.userId });
  }
  if (safeFilters.oldNumber) {
    query.$and.push({ $or: [{ oldNumber: safeFilters.oldNumber }] });
  }
  if (safeFilters.newNumber) {
    query.$and.push({ $or: [{ newNumber: safeFilters.newNumber }] });
  }
  if (safeFilters.ipAddress) {
    query.$and.push({ ipAddress: safeFilters.ipAddress });
  }
  if (safeFilters.dateFrom || safeFilters.dateTo) {
    const dateRange = {};
    if (safeFilters.dateFrom) dateRange.$gte = new Date(safeFilters.dateFrom);
    if (safeFilters.dateTo) dateRange.$lte = new Date(safeFilters.dateTo);
    query.$and.push({ timestamp: dateRange });
  }

  // 5. Execution
  const sortableFields = new Set(["timestamp", "createdAt", "updatedAt"]);
  const sort = {};
  sort[sortableFields.has(sortBy) ? sortBy : "timestamp"] = sortOrder === "asc" ? 1 : -1;

  const auditLogs = await AuditLog.find(query)
    .populate("userId", "name email phone")
    .sort(sort)
    .skip(skip)
    .limit(pageSize)
    .lean();

  const totalLogs = await AuditLog.countDocuments(query);

  // 6. Return mapped response
  return {
    auditLogs: auditLogs.map((log) => {
      const u = log.userId;
      return {
        id: log._id,
        action: log.action || AUDIT_LOG_ACTIONS.PHONE_NUMBER_CHANGE,
        oldNumber: log.oldNumber ?? null,
        newNumber: log.newNumber ?? null,
        user: u ? {
          id: u._id,
          name: u.name || null,
          username: u.name || null,
          email: u.email || null,
          useremail: u.email || null,
        } : null,
        ipAddress: log.ipAddress || null,
        deviceInfo: log.deviceInfo ? (() => {
          const userAgent = log.deviceInfo.userAgent || "";
          const parsed = parseUserAgent(userAgent);
          return {
            deviceId: log.deviceInfo.deviceId || parsed.deviceId || null,
            deviceName: log.deviceInfo.deviceName || parsed.deviceName || null,
            platform: log.deviceInfo.platform || parsed.platform || null,
            appVersion: log.deviceInfo.appVersion || parsed.appVersion || null,
          };
        })() : null,
        timestamp: log.timestamp || log.createdAt || null,
      };
    }),
    limit: pageSize,
    totalPages: Math.ceil(totalLogs / pageSize),
    total: totalLogs,
    page: currentPage,
  };
}

module.exports = {
  registerAdmin,
  login,
  logout,
  forgotPassword,
  resetPassword,
  updateDetails,
  adminList,
  adminDelete,
  phoneNumberChangeAuditLogs,
};

const crypto = require("crypto");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const Admin = require("../../schemas/admin.schema");
const RefreshToken = require("../../schemas/refreshtoken.schema");
const AuditLog = require("../../schemas/audit-log.schema");
const { AUDIT_LOG_ACTIONS } = require("../../constants/audit-logs");
const User = require("../../schemas/user.schema");
const {
  sendFailResponse,
  sendResponse,
} = require("../../utils/responseHandlers");
const {
  compareHash,
  generateToken,
  parseUserAgent,
} = require("../../utils/heplers");
const { sendMail, sendTemplateEmail } = require("../../functions/nodemailer");

async function generateAndSaveToken(admin) {
  const accessPayload = {
    adminId: admin._id,
    email: admin.email,
    accessTokenVersion: admin.accessTokenVersion || 0,
  };
  const accessToken = generateToken(accessPayload, "30m");

  if (!accessToken) return { accessToken: null };

  const refreshPayload = {
    adminId: admin._id,
    email: admin.email,
    tokenVersion: admin.tokenVersion || 0,
  };
  const refreshTokenStr = generateToken(refreshPayload, "60d");
  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days

  await RefreshToken.create({
    userId: admin._id,
    refreshToken: refreshTokenStr,
    expiresAt,
  });

  return { accessToken, refreshToken: refreshTokenStr };
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
// Create Admin (Admin Panel - sends temporary password via welcome email template)
// ----------------------
async function createAdmin(adminData, createdBy) {
  const name = (adminData.userfullname || adminData.name || "").trim();
  const email = (adminData.useremail || adminData.email || "")
    .toLowerCase()
    .trim();
  const phone = (
    adminData.usermobile ||
    adminData.phone ||
    adminData.mobile ||
    ""
  ).trim();
  const role = adminData.usertype || adminData.role || "ADMIN";
  const active =
    adminData.active !== undefined
      ? Number(adminData.active) === 1
        ? 1
        : 0
      : 1;
  const status = adminData.status || (active === 1 ? "active" : "inactive");

  if (!name) sendFailResponse("Admin name is required");
  if (!email) sendFailResponse("Admin email is required");

  //  Check if admin already exists
  const adminExist = await Admin.findOne({ email });
  if (adminExist)
    sendFailResponse("An admin with this email address already exists");

  // 2Generate a secure temporary password if not provided
  const temporaryPassword =
    adminData.password ||
    crypto.randomBytes(4).toString("hex").toUpperCase() +
      "@" +
      Math.floor(1000 + Math.random() * 9000);

  //  Create new admin
  const newAdminData = {
    name,
    email,
    password: temporaryPassword,
    phone,
    role,
    active,
    status,
  };
  if (createdBy) newAdminData.createdBy = createdBy;

  const admin = await Admin.create(newAdminData);

  // Send Welcome Email using .hbs template
  const loginUrl =
    process.env.FRONTEND_URL || "https://hydaconadminwebapp.onrender.com";

  try {
    await sendTemplateEmail(
      admin.email,
      "admin/welcome-admin",
      "Welcome to Hydacon Admin Portal 🎉",
      {
        name: admin.name,
        userfullname: admin.name,
        email: admin.email,
        useremail: admin.email,
        password: temporaryPassword,
        role: admin.role,
        usertype: admin.role,
        loginUrl,
        currentYear: new Date().getFullYear(),
      },
    );
    console.log("📨 Welcome email template sent to:", admin.email);
  } catch (error) {
    console.error("⚠️ Failed to send welcome email template:", error.message);
  }

  const { password: pw, ...rest } = admin.toObject();

  return {
    status: "Success",
    message: "Admin created successfully and credentials sent via email",
    data: {
      ...rest,
      id: rest._id,
      userfullname: rest.name,
      useremail: rest.email,
      usermobile: rest.phone || "",
      usertype: rest.role || "ADMIN",
      active: rest.active !== undefined ? rest.active : 1,
      status: rest.status || "active",
    },
  };
}

// ----------------------
// Update Admin
// ----------------------
async function updateAdmin(adminData) {
  const adminId = adminData.id || adminData._id || adminData.adminId;
  if (!adminId) sendFailResponse("Admin ID is required");

  const admin = await Admin.findById(adminId);
  if (!admin) sendFailResponse("Admin not found");

  if (adminData.userfullname || adminData.name) {
    admin.name = (adminData.userfullname || adminData.name).trim();
  }
  if (adminData.usermobile || adminData.phone || adminData.mobile) {
    admin.phone = (
      adminData.usermobile ||
      adminData.phone ||
      adminData.mobile
    ).trim();
  }
  if (adminData.usertype || adminData.role) {
    admin.role = adminData.usertype || adminData.role;
  }
  if (adminData.active !== undefined) {
    admin.active = Number(adminData.active) === 1 ? 1 : 0;
    admin.status = admin.active === 1 ? "active" : "inactive";
  }
  if (adminData.status) {
    admin.status = adminData.status;
  }

  await admin.save();
  const { password: pw, ...rest } = admin.toObject();

  return {
    status: "Success",
    message: "Admin updated successfully",
    data: {
      ...rest,
      id: rest._id,
      userfullname: rest.name,
      useremail: rest.email,
      usermobile: rest.phone || "",
      usertype: rest.role || "ADMIN",
      active: rest.active !== undefined ? rest.active : 1,
      status: rest.status || "active",
    },
  };
}

// ----------------------
// Get Admin Details
// ----------------------
async function getAdminDetails(adminId) {
  if (!adminId) sendFailResponse("Admin ID is required");
  const admin = await Admin.findById(adminId).lean();
  if (!admin) sendFailResponse("Admin not found");

  const { password, ...rest } = admin;
  return {
    status: "Success",
    data: {
      ...rest,
      id: rest._id,
      userfullname: rest.name,
      useremail: rest.email,
      usermobile: rest.phone || "",
      usertype: rest.role || "ADMIN",
      active: rest.active !== undefined ? rest.active : 1,
      status: rest.status || "active",
    },
  };
}

// ----------------------
// Register Admin
// ----------------------
async function registerAdmin(adminData, createdBy) {
  const { name, email, password } = adminData;

  //  Check if admin already exists
  const adminExist = await Admin.findOne({ email });
  if (adminExist) sendFailResponse("The mail id exist");

  // Create new admin
  const newAdminData = { name, email, password };
  if (createdBy) newAdminData.createdBy = createdBy;

  const admin = await Admin.create(newAdminData);

  //  Generate tokens
  const { accessToken, refreshToken } = await generateAndSaveToken(admin);

  const { password: pw, ...rest } = admin.toObject();

  // Send Welcome Email
  const loginUrl =
    process.env.FRONTEND_URL || "https://hydaconadminwebapp.onrender.com";

  try {
    await sendTemplateEmail(
      admin.email,
      "admin/welcome-admin",
      "Welcome to Hydacon Admin Panel 🎉",
      {
        name: admin.name,
        userfullname: admin.name,
        email: admin.email,
        useremail: admin.email,
        password,
        role: admin.role || "ADMIN",
        usertype: admin.role || "ADMIN",
        loginUrl,
        currentYear: new Date().getFullYear(),
      },
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

  const { accessToken, refreshToken } =
    await generateAndSaveToken(existingAdmin);

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
  const admin = await Admin.findById(adminId);
  if (admin) {
    admin.tokenVersion = (admin.tokenVersion || 0) + 1;
    admin.accessTokenVersion = (admin.accessTokenVersion || 0) + 1;
    await admin.save();

    await RefreshToken.deleteMany({ userId: admin._id });
  }
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
async function adminList(data = {}) {
  const page = Math.max(Number(data.page || data.pageno || 1), 1);
  const limit = Math.max(Number(data.limit || data.recordcount || 10), 1);
  const search = (data.search || data.search_text || "").trim();
  const sortBy = data.sortBy || "createdAt";
  const sortOrder = data.sortOrder || "desc";
  const filters = data.filters || {};

  const skip = (page - 1) * limit;

  let query = {};
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { role: { $regex: search, $options: "i" } },
    ];
  }

  if (filters.authType) {
    query.authType = filters.authType;
  }
  if (filters.role) {
    query.role = filters.role;
  }
  if (filters.active !== undefined) {
    query.active = Number(filters.active);
  }
  if (filters.enableNotification !== undefined) {
    query.enableNotification = filters.enableNotification;
  }
  if (filters.agreedToTerms !== undefined) {
    query.agreedToTerms = filters.agreedToTerms;
  }

  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  const admins =
    (await Admin.find(query).sort(sort).skip(skip).limit(limit).lean()) ?? [];

  const totalAdmins = await Admin.countDocuments(query);

  const formattedAdmins = admins.map((admin) => {
    const { password, ...rest } = admin;
    return {
      ...rest,
      id: rest._id,
      userfullname: rest.name,
      useremail: rest.email,
      usermobile: rest.phone || "",
      usertype: rest.role || "ADMIN",
      active: rest.active !== undefined ? rest.active : 1,
      status: rest.status || (rest.active === 0 ? "inactive" : "active"),
    };
  });

  return {
    status: "Success",
    data: {
      admins: formattedAdmins,
      limit,
      pagesize: limit,
      totalPages: Math.ceil(totalAdmins / limit),
      totalPageCount: Math.ceil(totalAdmins / limit),
      total: totalAdmins,
      totalCount: totalAdmins,
      page,
      currentPage: page,
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
        { email: emailRegex },
        { phone: { $regex: search, $options: "i" } },
      ],
    })
      .select("_id")
      .lean();

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
  sort[sortableFields.has(sortBy) ? sortBy : "timestamp"] =
    sortOrder === "asc" ? 1 : -1;

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
        user: u
          ? {
              id: u._id,
              name: u.name || null,
              username: u.name || null,
              email: u.email || null,
              useremail: u.email || null,
            }
          : null,
        ipAddress: log.ipAddress || null,
        deviceInfo: log.deviceInfo
          ? (() => {
              const userAgent = log.deviceInfo.userAgent || "";
              const parsed = parseUserAgent(userAgent);
              return {
                deviceId: log.deviceInfo.deviceId || parsed.deviceId || null,
                deviceName:
                  log.deviceInfo.deviceName || parsed.deviceName || null,
                platform: log.deviceInfo.platform || parsed.platform || null,
                appVersion:
                  log.deviceInfo.appVersion || parsed.appVersion || null,
              };
            })()
          : null,
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
  createAdmin,
  updateAdmin,
  getAdminDetails,
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

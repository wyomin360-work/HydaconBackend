const User = require("../../schemas/user.schema");
const ServiceRequest = require("../../schemas/service-request.schema");
const RefreshToken = require("../../schemas/refreshtoken.schema");
const path = require("path");
const sharp = require("sharp");
const fs = require("fs");
const AuditLog = require("../../schemas/audit-log.schema");
const mongoose = require("mongoose");
const { AUDIT_LOG_ACTIONS } = require("../../constants/audit-logs");
const {
  sendFailResponse,
  sendResponse,
} = require("../../utils/responseHandlers");
const {
  compareHash,
  generateToken,
  attachId,
  generateOtp,
  generateBufferToken,
  hashData,
  generateRandomPassword,
  buildPhoneLookupVariants,
} = require("../../utils/heplers");
const {
  ServiceRequestStatus,
  ServiceRequestType,
} = require("../../constants/service-request");
const moment = require("moment");
const {
  verifyGoogleToken,
  verifyAppleIdentityToken,
} = require("../../functions/auth");
const { AuthTypes } = require("../../constants/user");
const { encrypt, decrypt } = require("../../utils/encryption");
const { validateIFSC } = require("../../functions/razorPay");
const { sendFcmNotifications } = require("../../functions/fcm");
const { sendSms } = require("../../functions/sms");
const { sendMail } = require("../../functions/nodemailer");

async function generateAndSaveToken(payload) {
  const accessToken = generateToken(payload);
  const refreshToken = generateToken(payload, "30d");
  const refreshTokenTokenExpiryIn = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  );

  if (!accessToken || !refreshToken)
    return { refreshToken: null, accessToken: null };

  await RefreshToken.deleteMany({ userId: payload?.userId });

  await RefreshToken.create({
    refreshToken,
    userId: payload?.userId,
    expiresAt: refreshTokenTokenExpiryIn, //30 days
  });

  if (!refreshToken || !accessToken)
    sendFailResponse("Failed to generate token");
  return { accessToken, refreshToken };
}

// ----------------------
// Register User
// ----------------------
async function registerUser(userData) {
  const { name, email, password, avatarId, phone, roleId } = userData;

  const userExist = await User.findOne({ email });
  if (userExist) sendFailResponse("The mail id exist");

  const user = await User.create({
    name,
    email,
    phone,
    password,
    authType: AuthTypes.EMAIL,
    avatarId,
    roleId,
  });

  const { refreshToken, accessToken } = await generateAndSaveToken({
    userId: user?._id,
    email: user?.email,
  });

  const populatedUser = await User.findById(user._id).populate("roleId");
  const { password: pw, ...rest } = populatedUser.toObject();

  return {
    message: "Registration successful",
    data: { ...rest, accessToken, refreshToken },
  };
}

// ----------------------
// Login User
// ----------------------
async function login(userData) {
  const { email, password } = userData;

  const userExist = await User.findOne({ email }).populate("roleId").lean();
  if (!userExist) sendFailResponse("Invalid Data");

  if (userExist && userExist.authType !== AuthTypes.EMAIL) {
    sendFailResponse(`This email is already registered with 
        ${userExist.authType}. Please log in using that method.`);
  }

  const isSamePassword = await compareHash(password, userExist.password);
  if (!isSamePassword) sendFailResponse("PassWord mismatch");

  const { refreshToken, accessToken } = await generateAndSaveToken({
    userId: userExist?._id,
    email: userExist?.email,
  });

  const { password: pw, ...rest } = attachId(userExist);

  return {
    message: "Logged in successfully",
    data: { ...rest, accessToken, refreshToken },
  };
}

// ----------------------
//  Provider Auth
// ----------------------

async function providerAuth(data) {
  const { idToken, provider, avatarId, firstName, lastName } = data;
  if (!idToken) sendFailResponse("Auth token missing");

  const isGoogleAuth = provider === AuthTypes.GOOGLE;

  let providerData = {};

  if (isGoogleAuth) {
    providerData = await verifyGoogleToken(idToken);
  } else if (provider === AuthTypes.APPLE) {
    providerData = await verifyAppleIdentityToken(idToken);
  }

  if (!providerData.isData)
    sendFailResponse(providerData?.message || "Google auth failed, try again");

  const { email, sub: authKey } = providerData;

  const userName = isGoogleAuth
    ? providerData?.name
    : `${firstName ?? "User"} ${lastName ?? ""}`;

  const userExist = await User.findOne({ email }).populate("roleId").lean();

  if (!userExist) {
    const newUser = await User.create({
      email,
      password: generateRandomPassword(48),
      authKey,
      authType: provider,
      name: userName,
      avatarId,
      roleId: data.roleId,
    });

    const { refreshToken, accessToken } = await generateAndSaveToken({
      userId: newUser?._id,
      email: newUser?.email,
    });

    const populatedNewUser = await User.findById(newUser._id).populate(
      "roleId",
    );
    const cleanData = populatedNewUser.toObject({
      getters: true,
      virtuals: false,
    });

    const { password: pw, ...rest } = attachId(cleanData);

    return {
      message: "Registered successfully",
      data: { ...rest, accessToken, refreshToken, newUser: true },
    };
  } else {
    // if (userExist && userExist.authType !== AuthTypes.GOOGLE)
    //     sendFailResponse(`This email is already registered with
    // ${userExist.authType}. Please log in using that method.`);

    const { refreshToken, accessToken } = await generateAndSaveToken({
      userId: userExist?._id,
      email: userExist?.email,
    });

    const { password: pw, ...rest } = attachId(userExist);

    return {
      message: "Logged in successfully ",
      data: { ...rest, accessToken, refreshToken, newUser: false },
    };
  }
}

// ----------------------
// Logout User
// ----------------------
async function logout(userId) {
  await RefreshToken.findOneAndDelete({ userId: userId });
  await User.findByIdAndUpdate(
    userId,
    { $addToSet: { fcmTokens: [] } },
    { new: true },
  );
  return { message: "Logged Out successfully", data: { loggedOut: true } };
}

// ----------------------
// verify Email
// ----------------------
async function verifyEmail(data) {
  const { email, phone } = data;

  if (!email && !phone) {
    sendFailResponse("Please provide an email or phone number.");
  }

  // 1. Build Query dynamically based on what was provided
  let user;
  if (email) {
    user = await User.findOne({ email: email.toLowerCase() });
  } else if (phone) {
    // This uses your existing robust variant builder
    user = await User.findOne({
      phone: { $in: buildPhoneLookupVariants(phone) },
    });
  }

  if (!user) sendFailResponse("User not found");

  const phoneToUse = phone || user.phone;
  const emailToUse = email || user.email;
  const { token, alreadySent } = await issueOtpForUser({
    userId: user._id,
    requestType: ServiceRequestType.FORGOT_PASSWORD,
    phoneNumber: phoneToUse,
    email: emailToUse,
    buildMessage: (otp) =>
      `Greetings from Hydacon, your verification OTP is: ${otp}`,
  });

  return {
    message: alreadySent
      ? "OTP already sent. Please check your phone or wait 60 seconds."
      : "OTP has been sent to your mobile number.",
    data: { otpSent: true, token, smsSent: true },
  };
}
// ----------------------
// verify Otp
// ----------------------
async function verifyOtp(data) {
  const { otp, token } = data;

  const verifySR = await ServiceRequest.findOne({
    token,
    status: ServiceRequestStatus.PENDING,
  });

  if (!verifySR) sendFailResponse("Token not found");

  const isExpired = moment().isAfter(verifySR.expiresAt);
  if (isExpired) {
    await ServiceRequest.findByIdAndDelete(verifySR._id);
    sendFailResponse("Otp expired");
  }

  const isCorrectOtp = await compareHash(otp, verifySR.data);
  if (!isCorrectOtp) {
    const nextAttempts = (verifySR.attempts || 0) + 1;
    if (nextAttempts >= 5) {
      await ServiceRequest.findByIdAndDelete(verifySR._id);
      sendFailResponse("Too many failed attempts. Please request a new OTP.");
    } else {
      verifySR.attempts = nextAttempts;
      await verifySR.save();
      sendFailResponse(`Otp mismatch. ${5 - nextAttempts} attempts remaining.`);
    }
  }

  await ServiceRequest.findByIdAndDelete(verifySR._id);

  const user = await User.findOne({ _id: verifySR.userId });
  if (!user) sendFailResponse("User not found");

  if (verifySR.requestType === ServiceRequestType.SIMPLE_OTP_LOGIN) {
    const { refreshToken, accessToken } = await generateAndSaveToken({
      userId: user._id,
      email: user.email,
    });

    const { password: pw, ...rest } = attachId(user.toObject());

    return {
      message: "Logged in successfully",
      data: { ...rest, accessToken, refreshToken, otpVerified: true },
    };
  }

  const resetToken = generateBufferToken();

  await ServiceRequest.deleteMany({
    userId: user.id,
    status: ServiceRequestStatus.PENDING,
    requestType: ServiceRequestType.RESET_PASSWORD,
  });

  await ServiceRequest.create({
    userId: user.id,
    token: resetToken,
    requestType: ServiceRequestType.RESET_PASSWORD,
    status: ServiceRequestStatus.PENDING,
    expiresAt: new Date(Date.now() + 20 * 60 * 1000),
  });

  return {
    message: "otp verified",
    data: { otpVerified: true, token: resetToken },
  };
}

// ----------------------
// update Password
// ----------------------
async function updatePassword(data) {
  const { password, token } = data;

  const verifySR = await ServiceRequest.findOne({
    token,
    status: ServiceRequestStatus.PENDING,
    requestType: ServiceRequestType.RESET_PASSWORD,
  });
  if (!verifySR) sendFailResponse("reset token not found");

  await User.findByIdAndUpdate(verifySR.userId, { password });

  await ServiceRequest.findByIdAndUpdate(verifySR._id, {
    status: ServiceRequestStatus.USED,
  });

  return {
    message: "Password updated successfully",
    data: { passwordUpdated: true },
  };
}

// ----------------------
// User Details
// ----------------------
async function getUserDetails(userId) {
  const user = await User.findById(userId).populate("roleId").lean();
  if (!user) sendFailResponse("User not found");
  let returnData = {};

  if (user.bankDetails) {
    const { bankDetails, ...rest } = attachId(user);
    returnData = rest;
  } else {
    returnData = attachId(user);
  }

  return { data: returnData };
}

const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

function buildOtpServiceRequest({
  userId,
  token,
  otpHash,
  requestType,
  payload,
  expiresInMs = 10 * 60 * 1000,
}) {
  return {
    userId,
    token,
    data: otpHash,
    payload,
    status: ServiceRequestStatus.PENDING,
    requestType,
    expiresAt: new Date(Date.now() + expiresInMs),
  };
}

async function findRecentOtpRequest(userId, requestType) {
  return ServiceRequest.findOne({
    userId,
    requestType,
    status: ServiceRequestStatus.PENDING,
    expiresAt: { $gt: new Date() },
    createdAt: { $gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) },
    smsSentAt: { $exists: true },
  }).sort({ createdAt: -1 });
}

/** Creates one OTP request and sends a single SMS (skips resend within cooldown). */
async function issueOtpForUser({
  userId,
  requestType,
  phoneNumber,
  email,
  payload,
  buildMessage,
}) {
  const recent = await findRecentOtpRequest(userId, requestType);

  if (recent) {
    return { token: recent.token, alreadySent: true };
  }

  await ServiceRequest.deleteMany({
    userId,
    status: ServiceRequestStatus.PENDING,
    requestType,
  });

  const token = generateBufferToken();
  const otp = generateOtp(4);
  const otpHash = await hashData(otp);
  if (!otpHash) sendFailResponse("Failed to process OTP");

  const serviceRequest = await ServiceRequest.create(
    buildOtpServiceRequest({ userId, token, otpHash, requestType, payload }),
  );

  let smsSent = false;
  let emailSent = false;
  let smsError = null;
  let emailError = null;

  if (phoneNumber) {
    try {
      await deliverOtpViaSms(phoneNumber, buildMessage(otp));
      smsSent = true;
    } catch (error) {
      smsError = error;
    }
  }

  if (email) {
    try {
      const mailResult = await sendMail({
        to: email,
        subject: "Hydacon OTP Verification",
        text: buildMessage(otp),
      });
      if (mailResult === true) {
        emailSent = true;
      } else {
        emailError = new Error("Failed to send email");
      }
    } catch (error) {
      emailError = error;
    }
  }

  if (!phoneNumber && !email) {
    await ServiceRequest.findByIdAndDelete(serviceRequest._id);
    sendFailResponse("No email or phone number provided to send OTP.");
  }

  if (!smsSent && !emailSent) {
    await ServiceRequest.findByIdAndDelete(serviceRequest._id);
    throw smsError || emailError || new Error("Failed to send OTP.");
  }

  await ServiceRequest.findByIdAndUpdate(serviceRequest._id, {
    smsSentAt: new Date(),
  });

  return { token, alreadySent: false };
}

function normalizePhone(phone) {
  return String(phone || "").trim();
}

function requirePhoneNumber(phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) sendFailResponse("New mobile number is required.");
  return normalizedPhone;
}

function buildRequestTypeQuery(requestType, allowedRequestTypes) {
  const requestTypes = allowedRequestTypes || [requestType];
  return requestTypes.length === 1 ? requestTypes[0] : { $in: requestTypes };
}

async function consumeOtpRequest({
  token,
  otp,
  userId,
  requestType,
  allowedRequestTypes,
}) {
  const cleanToken = String(token || "").trim();
  const cleanOtp = String(otp || "").trim();
  const requestTypeQuery = buildRequestTypeQuery(
    requestType,
    allowedRequestTypes,
  );

  const verifySR = await ServiceRequest.findOne({
    token: cleanToken,
    userId,
    requestType: requestTypeQuery,
    status: ServiceRequestStatus.PENDING,
  });

  if (!verifySR) {
    const tokenRequest = await ServiceRequest.findOne({
      token: cleanToken,
      userId,
    }).sort({ createdAt: -1 });

    if (!tokenRequest) {
      sendFailResponse("OTP token not found. Please request a new OTP.");
    }

    const validRequestTypes = allowedRequestTypes || [requestType];
    if (!validRequestTypes.includes(tokenRequest.requestType)) {
      sendFailResponse(
        "This OTP token is not valid for this verification step.",
      );
    }

    if (tokenRequest.status === ServiceRequestStatus.USED) {
      sendFailResponse(
        "OTP already verified. Please continue to the next step.",
      );
    }

    if (tokenRequest.status === ServiceRequestStatus.EXPIRED) {
      sendFailResponse("Otp expired");
    }

    sendFailResponse("OTP token not found. Please request a new OTP.");
  }

  const isExpired = moment().isAfter(verifySR.expiresAt);
  if (isExpired) {
    verifySR.status = ServiceRequestStatus.EXPIRED;
    await verifySR.save();
    sendFailResponse("Otp expired");
  }

  const isCorrectOtp = await compareHash(cleanOtp, verifySR.data);
  if (!isCorrectOtp) sendFailResponse("Otp mismatch");

  verifySR.status = ServiceRequestStatus.USED;
  verifySR.usedAt = new Date();
  await verifySR.save();

  return verifySR;
}

async function getValidOldPhoneVerification(
  userId,
  oldVerificationToken,
  session,
) {
  const query = {
    userId,
    requestType: ServiceRequestType.CHANGE_PHONE_OLD_VERIFIED,
    status: ServiceRequestStatus.PENDING,
    expiresAt: { $gt: new Date() },
  };

  if (oldVerificationToken) {
    query.token = oldVerificationToken;
  }

  const oldVerification = await ServiceRequest.findOne(query)
    .sort({ createdAt: -1 })
    .session(session || null);

  if (!oldVerification) {
    sendFailResponse("Please verify your current mobile number first.");
  }

  return oldVerification;
}

async function verifyOldNumber(data, userId) {
  const user = await User.findById(userId);
  if (!user) sendFailResponse("User not found");
  if (!user.phone) {
    sendFailResponse("No mobile number is linked to this account.");
  }

  const { otp, token } = data;

  if (Boolean(otp) !== Boolean(token)) {
    sendFailResponse(
      "Both OTP and token are required to verify current mobile number.",
    );
  }

  if (otp && token) {
    await consumeOtpRequest({
      token,
      otp,
      userId,
      requestType: ServiceRequestType.CHANGE_PHONE_OLD_OTP,
      allowedRequestTypes: [
        ServiceRequestType.CHANGE_PHONE_OLD_OTP,
        ServiceRequestType.SIMPLE_OTP_LOGIN,
      ],
    });

    await ServiceRequest.deleteMany({
      userId,
      status: ServiceRequestStatus.PENDING,
      requestType: ServiceRequestType.CHANGE_PHONE_OLD_VERIFIED,
    });

    const oldVerificationToken = generateBufferToken();
    await ServiceRequest.create({
      userId,
      token: oldVerificationToken,
      requestType: ServiceRequestType.CHANGE_PHONE_OLD_VERIFIED,
      status: ServiceRequestStatus.PENDING,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      payload: { phone: user.phone },
    });

    return {
      message: "Current mobile number verified",
      data: { oldNumberVerified: true, token: oldVerificationToken },
    };
  }

  const otpResponse = await issueOtpForUser({
    userId: user._id,
    requestType: ServiceRequestType.CHANGE_PHONE_OLD_OTP,
    phoneNumber: user.phone,
    buildMessage: (otp) =>
      `Your Hydacon mobile number change OTP is: ${otp}. Valid for 10 minutes.`,
  });

  return {
    message: otpResponse.alreadySent
      ? "OTP already sent. Please check your phone or wait 60 seconds."
      : "OTP has been sent to your current mobile number.",
    data: { otpSent: true, token: otpResponse.token, smsSent: true },
  };
}

async function verifyNewNumber(data, userId, ipAddress, deviceInfo = {}) {
  const { phone, otp, token, oldVerificationToken } = data;
  const user = await User.findById(userId);
  if (!user) sendFailResponse("User not found");

  if (Boolean(otp) !== Boolean(token)) {
    sendFailResponse(
      "Both OTP and token are required to verify new mobile number.",
    );
  }

  if (otp && token) {
    const newOtpRequest = await consumeOtpRequest({
      token,
      otp,
      userId,
      requestType: ServiceRequestType.CHANGE_PHONE_NEW_OTP,
    });

    const newPhone = newOtpRequest.payload?.phone;
    const response = await finalizeNumberChange({
      userId,
      newPhone,
      ipAddress,
      deviceInfo,
      oldVerificationToken: newOtpRequest.payload?.oldVerificationToken,
    });

    return response;
  }

  const newPhone = requirePhoneNumber(phone);

  let oldVerification = null;
  if (user.phone) {
    oldVerification = await getValidOldPhoneVerification(
      userId,
      oldVerificationToken,
    );
  }

  if (user.phone && buildPhoneLookupVariants(newPhone).includes(user.phone)) {
    sendFailResponse(
      "New mobile number must be different from the current number.",
    );
  }

  const otpResponse = await issueOtpForUser({
    userId: user._id,
    requestType: ServiceRequestType.CHANGE_PHONE_NEW_OTP,
    phoneNumber: newPhone,
    payload: {
      phone: newPhone,
      oldVerificationToken: oldVerification?.token || oldVerificationToken,
    },
    buildMessage: (otp) =>
      `Your Hydacon new mobile number OTP is: ${otp}. Valid for 10 minutes.`,
  });

  return {
    message: otpResponse.alreadySent
      ? "OTP already sent. Please check your phone or wait 60 seconds."
      : "OTP has been sent to your new mobile number.",
    data: { otpSent: true, token: otpResponse.token, smsSent: true },
  };
}

async function finalizeNumberChange({
  userId,
  newPhone,
  ipAddress,
  deviceInfo = {},
  oldVerificationToken,
}) {
  const normalizedPhone = requirePhoneNumber(newPhone);
  const session = await mongoose.startSession();

  try {
    let updatedUser;

    await session.withTransaction(async () => {
      const user = await User.findById(userId).session(session);
      if (!user) sendFailResponse("User not found");

      if (user.phone) {
        await getValidOldPhoneVerification(
          userId,
          oldVerificationToken,
          session,
        );
      }

      const oldPhone = user.phone || null;
      user.phone = normalizedPhone;
      updatedUser = await user.save({ session });

      const auditLog = new AuditLog({
        userId: user._id,
        action: AUDIT_LOG_ACTIONS.PHONE_NUMBER_CHANGE,
        oldNumber: oldPhone,
        newNumber: normalizedPhone,
        timestamp: new Date(),
        ipAddress: ipAddress || null,
        deviceInfo: {
          userAgent: deviceInfo?.userAgent || null,
          deviceId: deviceInfo?.deviceId || null,
          deviceName: deviceInfo?.deviceName || null,
          platform: deviceInfo?.platform || null,
          appVersion: deviceInfo?.appVersion || null,
        },
      });
      await auditLog.save({ session });

      await ServiceRequest.updateMany(
        {
          userId,
          requestType: {
            $in: [
              ServiceRequestType.CHANGE_PHONE_OLD_VERIFIED,
              ServiceRequestType.CHANGE_PHONE_NEW_OTP,
            ],
          },
          status: ServiceRequestStatus.PENDING,
        },
        { status: ServiceRequestStatus.USED, usedAt: new Date() },
        { session },
      );
    });

    return {
      message: "Mobile number updated successfully",
      data: {
        phoneUpdated: true,
        userId: updatedUser._id,
        phone: updatedUser.phone,
      },
    };
  } finally {
    await session.endSession();
  }
}

function getRegisterUrl() {
  return (
    process.env.USER_REGISTER_URL ||
    process.env.MOBILE_APP_REGISTER_URL ||
    `${process.env.FRONTEND_URL || "https://hydacon.com"}/register`
  );
}

function resolveOtpPhone(user, identity, isEmail) {
  if (!isEmail) {
    return user?.phone || identity;
  }
  if (!user?.phone) {
    sendFailResponse(
      "No mobile number on this account. Log in with your phone number instead of email.",
    );
  }
  return user.phone;
}

/** Sends OTP via Twilio SMS only. */
async function deliverOtpViaSms(phoneNumber, message) {
  if (!phoneNumber) {
    sendFailResponse("A mobile number is required to send OTP.");
  }

  const smsResult = await sendSms(phoneNumber, message);
  const smsSent =
    typeof smsResult === "boolean" ? smsResult : Boolean(smsResult?.success);

  if (!smsSent) {
    const error = smsResult?.error || "";
    const isTwilioAuthError = error.includes("(20003)");
    const message = isTwilioAuthError
      ? "Failed to send OTP because Twilio authentication failed. Please check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env."
      : "Failed to send OTP to your mobile number. If you are using a Twilio trial account, verify the recipient number in your Twilio console.";

    sendFailResponse(message);
  }

  return { smsSent: true };
}

async function simpleLoginWithOtp(data) {
  const { identity } = data;

  // 1. Validation
  if (!identity) {
    sendFailResponse("Please provide a mobile number.");
  }

  const cleanIdentity = identity.trim();
  const isEmail = cleanIdentity.includes("@");

  // 2. Lookup
  const lookupQuery = isEmail
    ? { email: cleanIdentity.toLowerCase() }
    : { phone: { $in: buildPhoneLookupVariants(cleanIdentity) } };

  const user = await User.findOne(lookupQuery);

  // 3. User check (This now triggers an error and stops the function if user is null)
  if (!user) {
    sendFailResponse("Account not found with given mobile number");
  }

  // 4. Auth type check
  // if (user.authType !== AuthTypes.EMAIL) {
  //   sendFailResponse(
  //     `This account is linked with ${user.authType}. Please use that method.`,
  //   );
  // }

  const phoneToUse = resolveOtpPhone(user, cleanIdentity, isEmail);
  const { token, alreadySent } = await issueOtpForUser({
    userId: user._id,
    requestType: ServiceRequestType.SIMPLE_OTP_LOGIN,
    phoneNumber: phoneToUse,
    buildMessage: (otp) =>
      `Your Hydacon login OTP is: ${otp}. Valid for 10 minutes.`,
  });

  return {
    message: alreadySent
      ? "OTP already sent. Please check your phone or wait 60 seconds."
      : "OTP has been sent to your mobile number.",
    data: { otpSent: true, token, smsSent: true },
  };
}

// ----------------------
// Update User profile
// ----------------------
async function updateUserProfile(data, userId) {
  const user = await User.findById(userId);
  if (!user) sendFailResponse("User not found");

  if (data.name !== undefined) user.name = data.name;
  if (data.avatarId !== undefined) user.avatarId = data.avatarId;
  if (data.dob !== undefined) user.dob = data.dob ? new Date(data.dob) : null;
  if (data.phone !== undefined) user.phone = data.phone;
  if (data.shopName !== undefined) user.shopName = data.shopName;
  if (data.experience !== undefined) user.experience = data.experience;
  if (data.areaOfOperation !== undefined)
    user.areaOfOperation = data.areaOfOperation;
  if (data.profilePhoto !== undefined) user.profilePhoto = data.profilePhoto;

  await user.save();

  const populatedUser = await User.findById(userId).populate("roleId");
  const { password, ...rest } = populatedUser.toObject();

  return {
    message: "Profile Updated Successfully",
    data: { ...rest, profileUpdated: true },
  };
}

// ----------------------
// Update User settings
// ----------------------
async function updatePreferences(data, userId) {
  const { enableNotification } = data;
  const user = await User.findByIdAndUpdate(userId, { enableNotification });
  if (!user) sendFailResponse("User not found");
  return {
    message: "Settings Updated Successfully",
    data: { userPreferenceUpdated: true },
  };
}

// ----------------------
// Add User Fcm token
// ----------------------
async function addFcmToken(data, userId) {
  const { fcmToken } = data;
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $addToSet: { fcmTokens: fcmToken },
    },
    { new: true },
  );
  if (!user) sendFailResponse("User not found");
  return { data: { tokenUpdated: true, updatedTokens: user.fcmTokens } };
}

// ----------------------
// User Bank Details
// ----------------------
async function getUserBankDetails(userId) {
  const user = await User.findById(userId).lean();
  if (!user) sendFailResponse("User not found");

  if (!user.bankDetails?.accountNumber || !user.bankDetails?.ifscCode)
    sendFailResponse("Bank details are not added yet");

  const accountNumber = decrypt(
    user.bankDetails.accountNumber,
    user.bankDetails?.accountIv,
  );
  const ifscCode = decrypt(
    user.bankDetails?.ifscCode,
    user.bankDetails?.ifscIv,
  );

  if (!accountNumber || !ifscCode)
    sendFailResponse("Unable to get user bank details");
  const { accountIv, ifscIv, ...rest } = user?.bankDetails;
  return {
    ...rest,
    accountNumber: accountNumber,
    ifscCode: ifscCode,
  };
}

// ----------------------
// Add Bank Details
// ----------------------
async function addUserBankDetails(data, userId) {
  const { accountNumber, ifscCode, userName } = data;

  const user = await User.findById(userId);
  if (!user) sendFailResponse("User not found");
  if (user.bankDetails?.accountNumber)
    sendFailResponse(
      "user have already added account details , please update existing if need to change account",
    );

  const bankInfo = await validateIFSC(ifscCode);
  if (!bankInfo) sendFailResponse("Invalid ifscCode");

  const encryptedAccountNumber = encrypt(accountNumber);
  const encryptedIfscCode = encrypt(ifscCode);

  if (!encryptedAccountNumber || !encryptedIfscCode)
    sendFailResponse("Unable to process bank details , try again");

  await User.findByIdAndUpdate(userId, {
    bankDetails: {
      accountNumber: encryptedAccountNumber.encryptedData,
      accountIv: encryptedAccountNumber.iv,
      ifscCode: encryptedIfscCode.encryptedData,
      ifscIv: encryptedIfscCode.iv,
      userName,
      branchName: bankInfo?.BRANCH,
      bankName: bankInfo?.BANK,
    },
  });
  return {
    message: "Bank details been added successfully",
    data: { addedBankDetails: true },
  };
}

// ----------------------
// Update Bank Details
// ----------------------
async function updateBankDetails(data, userId) {
  const { accountNumber, ifscCode, userName, bankName, branchName } = data;
  const user = await User.findById(userId);
  if (!user) sendFailResponse("User not found");
  if (!user.bankDetails?.accountNumber)
    sendFailResponse("Bank details are not added yet");

  const bankInfo = await validateIFSC(ifscCode);
  if (!bankInfo) sendFailResponse("Invalid ifscCode");

  const encryptedAccountNumber = encrypt(accountNumber);
  const encryptedIfscCode = encrypt(ifscCode);

  if (!encryptedAccountNumber || !encryptedIfscCode)
    sendFailResponse("Unable to process bank details , try again");

  await User.findByIdAndUpdate(userId, {
    bankDetails: {
      accountNumber: encryptedAccountNumber.encryptedData,
      accountIv: encryptedAccountNumber.iv,
      ifscCode: encryptedIfscCode.encryptedData,
      ifscIv: encryptedIfscCode.iv,
      userName,
      branchName: bankInfo?.BRANCH,
      bankName: bankInfo?.BANK,
    },
  });
  return {
    message: "Bank details been updated successfully",
    data: { updatedBankDetails: true },
  };
}

// ----------------------
// Delete Bank Details
// ----------------------
async function deleteBankDetails(userId) {
  const user = await User.findById(userId);
  if (!user) sendFailResponse("User not found");
  if (!user.bankDetails?.accountNumber)
    sendFailResponse("Bank details not found");
  await User.findByIdAndUpdate(userId, {
    bankDetails: {},
  });
  return {
    message: "Bank details been deleted successfully",
    data: { deletedBankDetails: true },
  };
}

// ----------------------
// Users List
// ----------------------

async function userList(data) {
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
  if (filters.currentTierId) {
    query.currentTierId = filters.currentTierId;
  }
  if (filters.areaOfOperation) {
    query.areaOfOperation = { $regex: filters.areaOfOperation, $options: "i" };
  }

  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  const users =
    (await User.find(query).populate("currentTierId", "name level").sort(sort).skip(skip).limit(limit).lean()) ?? [];

  const totalUsers = await User.countDocuments(query);

  return {
    data: {
      users,
      limit,
      totalPages: Math.ceil(totalUsers / limit),
      total: totalUsers,
      page,
    },
  };
}

// ----------------------
// Profile Photo Upload
// ----------------------
async function compressProfileImage(filePath) {
  const parsedPath = path.parse(filePath);
  const ext = parsedPath.ext.toLowerCase();
  const compressedFilename = `${parsedPath.name}-compressed${ext}`;
  const compressedPath = path.join(parsedPath.dir, compressedFilename);

  try {
    await sharp(filePath)
      .resize(400, 400, { fit: "cover" })
      .jpeg({ quality: 80, force: false })
      .png({ quality: 80, force: false })
      .toFile(compressedPath);

    return compressedFilename;
  } catch (error) {
    console.error("Error compressing profile image:", error);
    return parsedPath.base;
  }
}

async function uploadProfilePhoto(userId, file) {
  if (!file) {
    throw new Error("No file uploaded");
  }

  const allowedMimeTypes = ["image/jpeg", "image/png", "image/jpg"];
  const allowedExtensions = [".jpg", ".jpeg", ".png"];
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (
    !allowedMimeTypes.includes(file.mimetype) ||
    !allowedExtensions.includes(ext)
  ) {
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error("Error deleting invalid file type:", err);
      }
    }
    throw new Error(
      "Invalid file type. Only JPG, JPEG, and PNG files are allowed.",
    );
  }

  const maxFileSize = 5 * 1024 * 1024;
  if (file.size > maxFileSize) {
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error("Error deleting oversized file:", err);
      }
    }
    throw new Error("File size exceeds the 5MB limit.");
  }

  const user = await User.findById(userId);
  if (!user) {
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error("Error deleting orphaned file:", err);
      }
    }
    throw new Error("User not found");
  }

  if (user.profilePhoto) {
    const prevPhotoPath = path.join(__dirname, "../..", user.profilePhoto);
    if (fs.existsSync(prevPhotoPath)) {
      try {
        fs.unlinkSync(prevPhotoPath);
      } catch (err) {
        console.error("Error deleting previous profile photo:", err);
      }
    }
  }

  const originalFilename = file.filename;
  const compressedFilename = await compressProfileImage(file.path);
  const profilePhotoUrl = `/uploads/images/${compressedFilename}`;

  user.profilePhoto = profilePhotoUrl;
  await user.save();

  const populatedUser = await User.findById(userId).populate("roleId");
  const { password, ...rest } = populatedUser.toObject();

  return {
    message: "Profile photo uploaded successfully",
    data: rest,
  };
}

// ----------------------
// Flag User
// ----------------------
async function flagUser(userId, data) {
  const { isFlagged, flaggedReason } = data;
  const user = await User.findById(userId);
  if (!user) sendFailResponse("User not found");

  user.isFlagged = !!isFlagged;
  user.flaggedReason = isFlagged ? flaggedReason : null;
  await user.save();

  return {
    message: isFlagged
      ? "User flagged successfully"
      : "User unflagged successfully",
    data: { isFlagged: user.isFlagged, flaggedReason: user.flaggedReason },
  };
}

// ----------------------
// Admin User Details
// ----------------------
async function getAdminUserDetails(userId) {
  const user = await User.findById(userId)
    .populate("roleId", "name level pointMultiplier")
    .populate("currentTierId", "name level pointMultiplier")
    .lean();
    
  if (!user) sendFailResponse("User not found");

  if (user.bankDetails && user.bankDetails.accountNumber && user.bankDetails.accountIv) {
    user.bankDetails.accountNumber = decrypt(
      user.bankDetails.accountNumber,
      user.bankDetails.accountIv
    );
    user.bankDetails.ifscCode = decrypt(
      user.bankDetails.ifscCode,
      user.bankDetails.ifscIv
    );
    delete user.bankDetails.accountIv;
    delete user.bankDetails.ifscIv;
  }

  const Redeem = mongoose.model("Redeem");
  const purchasedProducts = await Redeem.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), status: "SUCCESS" } },
    { $group: { _id: "$productId", quantity: { $sum: 1 } } },
    { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, productId: "$_id", name: "$product.name", quantity: 1 } },
    { $sort: { quantity: -1 } }
  ]);

  return {
    data: {
      ...attachId(user),
      purchasedProducts,
    },
  };
}

module.exports = {
  registerUser,
  login,
  userList,
  logout,
  updatePassword,
  verifyEmail,
  verifyOtp,
  verifyOldNumber,
  verifyNewNumber,
  finalizeNumberChange,
  providerAuth,
  simpleLoginWithOtp,
  getUserDetails,
  getAdminUserDetails,
  updateUserProfile,
  addFcmToken,
  addUserBankDetails,
  updateBankDetails,
  deleteBankDetails,
  getUserBankDetails,
  updatePreferences,
  uploadProfilePhoto,
  flagUser,
};

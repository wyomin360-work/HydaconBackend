const User = require("../../schemas/user.schema");
const path = require("path");
const sharp = require("sharp");
const fs = require("fs");
const { sendFcmNotifications } = require("../../functions/fcm");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const { formatNotification } = require("../../utils/heplers");
<<<<<<< HEAD
const { KYC_STATUS, KYC_DOCUMENT_STATUS, KYC_DOCUMENT_TYPES } = require("../../constants/user");
=======
const { sendTemplateEmail } = require("../../functions/nodemailer");
>>>>>>> e5638921cd1e3106bb7b78c95c22590fd5d27769

async function compressImage(filePath) {
  const parsedPath = path.parse(filePath);
  const ext = parsedPath.ext.toLowerCase();

  // If document is a PDF or other non-image file, skip compression
  if (ext === ".pdf") {
    return parsedPath.base;
  }

  const compressedFilename = `${parsedPath.name}-compressed${ext}`;
  const compressedPath = path.join(parsedPath.dir, compressedFilename);

  try {
    await sharp(filePath)
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75, force: false })
      .png({ quality: 75, force: false })
      .toFile(compressedPath);

    return compressedFilename;
  } catch (error) {
    console.error("Error compressing image:", error);
    return parsedPath.base; // Fallback to original image if compression fails
  }
}

<<<<<<< HEAD
/**
 * Safely deletes a file from disk if it exists.
 */
function safeUnlink(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Error deleting file:', err);
    }
  }
}

async function uploadDocument(userId, documentType, file) {
  // Bug 1: Validate documentType first and clean up file on failure
  if (!Object.values(KYC_DOCUMENT_TYPES).includes(documentType)) {
    safeUnlink(file?.path);
    throw new Error(`Invalid document type. Allowed: ${Object.values(KYC_DOCUMENT_TYPES).join(', ')}`);
=======
async function uploadDocument(userId, documentType, file) {
  if (!["aadhaar", "pan", "shopPhoto"].includes(documentType)) {
    if (file && file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error("Error deleting file:", err);
      }
    }
    throw new Error("Invalid document type. Allowed: aadhaar, pan, shopPhoto");
>>>>>>> e5638921cd1e3106bb7b78c95c22590fd5d27769
  }

  if (!file) {
    throw new Error("No file uploaded");
  }

  // File type & extension validation
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/jpg",
    "application/pdf",
  ];
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".pdf"];
  const ext = path.extname(file.originalname || "").toLowerCase();

<<<<<<< HEAD
  if (!allowedMimeTypes.includes(file.mimetype) || !allowedExtensions.includes(ext)) {
    safeUnlink(file.path);
    throw new Error('Invalid file type. Only JPG, JPEG, PNG, and PDF files are allowed.');
=======
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
      "Invalid file type. Only JPG, JPEG, PNG, and PDF files are allowed.",
    );
>>>>>>> e5638921cd1e3106bb7b78c95c22590fd5d27769
  }

  // File size validation (5MB max)
  const maxFileSize = 5 * 1024 * 1024;
  if (file.size > maxFileSize) {
<<<<<<< HEAD
    safeUnlink(file.path);
    throw new Error('File size exceeds the 5MB limit.');
=======
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error("Error deleting oversized file:", err);
      }
    }
    throw new Error("File size exceeds the 5MB limit.");
>>>>>>> e5638921cd1e3106bb7b78c95c22590fd5d27769
  }

  let compressedPath = null;
  try {
    // Bug 2 fix: Compress image FIRST, then fetch user to avoid race condition.
    // Fetching the user after the slow compressImage avoids stale document / VersionError on save.
    const originalFilename = file.filename;
    const compressedFilename = await compressImage(file.path);

    if (compressedFilename !== file.filename) {
      const parsedPath = path.parse(file.path);
      compressedPath = path.join(parsedPath.dir, compressedFilename);
    }

    const originalUrl = `/uploads/images/${originalFilename}`;
    const compressedUrl = `/uploads/images/${compressedFilename}`;

    // Fetch user AFTER compression completes (Bug 2 fix)
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Initialize kycDocuments if not already present
    if (!user.kycDocuments) {
      user.kycDocuments = {};
    }

    // Set the document details — newly uploaded document resets to PENDING
    user.kycDocuments[documentType] = {
      originalUrl,
      compressedUrl,
      uploadedAt: new Date(),
<<<<<<< HEAD
      status: KYC_DOCUMENT_STATUS.PENDING,
      rejectionReason: null
=======
      status: "PENDING",
      rejectionReason: null,
>>>>>>> e5638921cd1e3106bb7b78c95c22590fd5d27769
    };

    // Bug 3 fix: Correctly recalculate overall status on re-upload.
    // If any OTHER document is still REJECTED, overall status must remain REJECTED,
    // not prematurely flip to PENDING just because all docs have been uploaded at least once.
    const docs = user.kycDocuments;
    const allUploaded =
      docs.aadhaar?.originalUrl &&
      docs.pan?.originalUrl &&
      docs.shopPhoto?.originalUrl;

    const anyRejected =
<<<<<<< HEAD
      docs.aadhaar?.status === KYC_DOCUMENT_STATUS.REJECTED ||
      docs.pan?.status === KYC_DOCUMENT_STATUS.REJECTED ||
      docs.shopPhoto?.status === KYC_DOCUMENT_STATUS.REJECTED;

    if (anyRejected) {
      user.kycStatus = KYC_STATUS.REJECTED;
    } else if (allUploaded) {
      user.kycStatus = KYC_STATUS.PENDING;
    } else {
      if (!user.kycStatus || user.kycStatus === KYC_STATUS.NOT_STARTED) {
        user.kycStatus = KYC_STATUS.NOT_STARTED;
=======
      docs.aadhaar?.status === "REJECTED" ||
      docs.pan?.status === "REJECTED" ||
      docs.shopPhoto?.status === "REJECTED";

    if (anyRejected) {
      user.kycStatus = "REJECTED";
    } else if (allUploaded) {
      user.kycStatus = "PENDING";
    } else {
      if (!user.kycStatus || user.kycStatus === "NOT_STARTED") {
        user.kycStatus = "NOT_STARTED";
>>>>>>> e5638921cd1e3106bb7b78c95c22590fd5d27769
      }
    }

    await user.save();

    return {
      message: `${documentType.toUpperCase()} document uploaded successfully`,
      kycStatus: user.kycStatus,
      documents: normalizeKycDocuments(user.kycDocuments),
    };
  } catch (error) {
<<<<<<< HEAD
    // Bug 1 fix: Clean up both original and compressed files on any error
    safeUnlink(file.path);
    if (compressedPath) {
      safeUnlink(compressedPath);
=======
    if (file && file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error("Error deleting original file on error:", err);
      }
    }
    if (compressedPath && fs.existsSync(compressedPath)) {
      try {
        fs.unlinkSync(compressedPath);
      } catch (err) {
        console.error("Error deleting compressed file on error:", err);
      }
>>>>>>> e5638921cd1e3106bb7b78c95c22590fd5d27769
    }
    throw error;
  }
}

function normalizeKycDocuments(kycDocuments) {
<<<<<<< HEAD
  const docTypes = Object.values(KYC_DOCUMENT_TYPES);
=======
  const docTypes = ["aadhaar", "pan", "shopPhoto"];
>>>>>>> e5638921cd1e3106bb7b78c95c22590fd5d27769
  const normalized = {};

  docTypes.forEach((type) => {
    const doc = kycDocuments?.[type];
    const hasFile = !!(doc?.originalUrl || doc?.compressedUrl);
    normalized[type] = hasFile ? doc : null;
  });

  return normalized;
}

async function getKycStatus(userId) {
  const user = await User.findById(userId).select("kycStatus kycDocuments");
  if (!user) {
    throw new Error("User not found");
  }
  return {
<<<<<<< HEAD
    kycStatus: user.kycStatus || KYC_STATUS.NOT_STARTED,
=======
    kycStatus: user.kycStatus || "NOT_STARTED",
>>>>>>> e5638921cd1e3106bb7b78c95c22590fd5d27769
    kycDocuments: normalizeKycDocuments(user.kycDocuments),
  };
}

async function getAdminKycList(filters = {}) {
  const query = {};
  if (filters.status) {
    query.kycStatus = filters.status;
  } else {
    query.kycStatus = { $ne: KYC_STATUS.NOT_STARTED };
  }

  const users = await User.find(query)
    .select("name email kycStatus kycDocuments updatedAt")
    .sort({ updatedAt: -1 });

<<<<<<< HEAD
  const allCount = await User.countDocuments({ kycStatus: { $ne: KYC_STATUS.NOT_STARTED } });
  const pendingCount = await User.countDocuments({ kycStatus: KYC_STATUS.PENDING });
  const approvedCount = await User.countDocuments({ kycStatus: { $in: [KYC_STATUS.APPROVED, KYC_STATUS.VERIFIED] } });
  const rejectedCount = await User.countDocuments({ kycStatus: KYC_STATUS.REJECTED });
=======
  const allCount = await User.countDocuments({
    kycStatus: { $ne: "NOT_STARTED" },
  });
  const pendingCount = await User.countDocuments({ kycStatus: "PENDING" });
  const approvedCount = await User.countDocuments({
    kycStatus: { $in: ["APPROVED", "VERIFIED"] },
  });
  const rejectedCount = await User.countDocuments({ kycStatus: "REJECTED" });
>>>>>>> e5638921cd1e3106bb7b78c95c22590fd5d27769

  return {
    users,
    counts: {
      all: allCount,
      PENDING: pendingCount,
      APPROVED: approvedCount,
      REJECTED: rejectedCount,
    },
  };
}

async function reviewKycDocument(
  userId,
  { documentType, status, rejectionReason },
) {
  let normalizedStatus = status.toUpperCase();
  if (normalizedStatus === KYC_STATUS.VERIFIED) {
    normalizedStatus = KYC_DOCUMENT_STATUS.APPROVED;
  }

  if (![KYC_DOCUMENT_STATUS.APPROVED, KYC_DOCUMENT_STATUS.REJECTED].includes(normalizedStatus)) {
    throw new Error(
      `Invalid review status. Allowed: ${KYC_DOCUMENT_STATUS.APPROVED}, ${KYC_STATUS.VERIFIED}, ${KYC_DOCUMENT_STATUS.REJECTED}`,
    );
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (documentType) {
    // --- Per-document review ---
    if (!Object.values(KYC_DOCUMENT_TYPES).includes(documentType)) {
      throw new Error(`Invalid document type. Allowed: ${Object.values(KYC_DOCUMENT_TYPES).join(', ')}`);
    }

    if (
      !user.kycDocuments ||
      !user.kycDocuments[documentType] ||
      !user.kycDocuments[documentType].originalUrl
    ) {
      throw new Error(`No upload found for ${documentType} to review`);
    }

    user.kycDocuments[documentType].status = normalizedStatus;
    user.kycDocuments[documentType].rejectionReason =
      normalizedStatus === KYC_DOCUMENT_STATUS.REJECTED ? rejectionReason : null;

    // Bug 4 fix: Recalculate global kycStatus correctly for per-document reviews.
    // Only fall back to PENDING if all three documents are uploaded;
    // if some are missing, the overall status stays NOT_STARTED.
    const docs = user.kycDocuments;
<<<<<<< HEAD
    const allUploaded = docs.aadhaar?.originalUrl && docs.pan?.originalUrl && docs.shopPhoto?.originalUrl;
    const anyRejected =
      docs.aadhaar?.status === KYC_DOCUMENT_STATUS.REJECTED ||
      docs.pan?.status === KYC_DOCUMENT_STATUS.REJECTED ||
      docs.shopPhoto?.status === KYC_DOCUMENT_STATUS.REJECTED;
=======
    const allUploaded =
      docs.aadhaar?.originalUrl &&
      docs.pan?.originalUrl &&
      docs.shopPhoto?.originalUrl;

    const anyRejected =
      docs.aadhaar?.status === "REJECTED" ||
      docs.pan?.status === "REJECTED" ||
      docs.shopPhoto?.status === "REJECTED";
>>>>>>> e5638921cd1e3106bb7b78c95c22590fd5d27769

    const allApproved =
      docs.aadhaar?.status === KYC_DOCUMENT_STATUS.APPROVED &&
      docs.pan?.status === KYC_DOCUMENT_STATUS.APPROVED &&
      docs.shopPhoto?.status === KYC_DOCUMENT_STATUS.APPROVED;

    if (anyRejected) {
      user.kycStatus = KYC_STATUS.REJECTED;
    } else if (allApproved) {
<<<<<<< HEAD
      user.kycStatus = KYC_STATUS.APPROVED;
    } else if (allUploaded) {
      user.kycStatus = KYC_STATUS.PENDING;
    } else {
      user.kycStatus = KYC_STATUS.NOT_STARTED;
=======
      user.kycStatus = "APPROVED";
    } else if (allUploaded) {
      user.kycStatus = "PENDING";
    } else {
      user.kycStatus = "NOT_STARTED";
>>>>>>> e5638921cd1e3106bb7b78c95c22590fd5d27769
    }
  } else {
    // --- Global review (no documentType provided) ---
    if (!user.kycDocuments) {
      user.kycDocuments = {
        aadhaar: {},
        pan: {},
        shopPhoto: {},
      };
    }

    const docs = user.kycDocuments;
    const allUploaded =
      docs.aadhaar?.originalUrl &&
      docs.pan?.originalUrl &&
      docs.shopPhoto?.originalUrl;
    const hasAtLeastOneDoc =
      docs.aadhaar?.originalUrl ||
      docs.pan?.originalUrl ||
      docs.shopPhoto?.originalUrl;

<<<<<<< HEAD
    // New Bug fix: Admin cannot approve KYC entirely if no documents have been uploaded
    if (normalizedStatus === KYC_DOCUMENT_STATUS.APPROVED && !hasAtLeastOneDoc) {
      throw new Error('Cannot approve KYC entirely because no documents have been uploaded');
    }

    // New Bug fix: Admin cannot reject KYC entirely unless all documents are uploaded
    if (normalizedStatus === KYC_DOCUMENT_STATUS.REJECTED && !allUploaded) {
      throw new Error('Cannot reject KYC entirely because not all documents have been uploaded');
    }

    const docTypes = Object.values(KYC_DOCUMENT_TYPES);
    docTypes.forEach(type => {
=======
    if (normalizedStatus === "APPROVED" && !hasAtLeastOneDoc) {
      throw new Error(
        "Cannot approve KYC entirely because no documents have been uploaded",
      );
    }

    if (normalizedStatus === "REJECTED" && !allUploaded) {
      throw new Error(
        "Cannot reject KYC entirely because not all documents have been uploaded",
      );
    }

    const docTypes = ["aadhaar", "pan", "shopPhoto"];
    docTypes.forEach((type) => {
>>>>>>> e5638921cd1e3106bb7b78c95c22590fd5d27769
      if (!user.kycDocuments[type]) {
        user.kycDocuments[type] = {};
      }
      user.kycDocuments[type].status = normalizedStatus;
      user.kycDocuments[type].rejectionReason =
        normalizedStatus === KYC_DOCUMENT_STATUS.REJECTED ? rejectionReason : null;
      if (
        normalizedStatus === KYC_DOCUMENT_STATUS.APPROVED &&
        !user.kycDocuments[type].uploadedAt
      ) {
        user.kycDocuments[type].uploadedAt = new Date();
      }
    });

    user.kycStatus = normalizedStatus;
  }

  await user.save();

  // Trigger FCM notification
  if (user.fcmTokens?.length && user.enableNotification) {
    try {
      if (user.kycStatus === KYC_STATUS.APPROVED) {
        const title = APP_NOTIFICATIONS.kyc.approved.title;
        const body = APP_NOTIFICATIONS.kyc.approved.body;
        await sendFcmNotifications(user.fcmTokens, title, body);
      } else if (user.kycStatus === KYC_STATUS.REJECTED) {
        const title = APP_NOTIFICATIONS.kyc.rejected.title;
        const body = formatNotification(APP_NOTIFICATIONS.kyc.rejected.body, {
          reason: rejectionReason || "Information mismatch",
        });
        await sendFcmNotifications(user.fcmTokens, title, body);
      }
    } catch (notificationErr) {
      console.error("Error sending KYC status notification:", notificationErr);
    }
  }

  // Trigger email notification integration
  if (user.email) {
    try {
      if (user.kycStatus === "APPROVED") {
        await sendTemplateEmail(
          user.email,
          "users/kycApproved",
          "KYC Verified Successfully 🎉",
          { userName: user.name },
        );
      } else if (user.kycStatus === "REJECTED") {
        await sendTemplateEmail(
          user.email,
          "users/kycRejected",
          "KYC Verification Failed ⚠️",
          {
            userName: user.name,
            rejectionReason: rejectionReason || "Information mismatch",
          },
        );
      }
    } catch (emailErr) {
      console.error("Error sending KYC status email:", emailErr);
    }
  }

  const reviewType = documentType ? documentType.toUpperCase() : "GLOBAL KYC";
  return {
    message: `Successfully reviewed and set ${reviewType} status to ${normalizedStatus}`,
    kycStatus: user.kycStatus,
    documents: user.kycDocuments,
  };
}

module.exports = {
  uploadDocument,
  getKycStatus,
  getAdminKycList,
  reviewKycDocument,
};

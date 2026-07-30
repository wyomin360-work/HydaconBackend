const User = require("../../schemas/user.schema");
const { checkS3FileExists, deleteS3File } = require("../../utils/s3");
const path = require("path");
const sharp = require("sharp");
const fs = require("fs");
const { sendFcmNotifications } = require("../../functions/fcm");
const { APP_NOTIFICATIONS, getNotification } = require("../../constants/notifications");
const { formatNotification } = require("../../utils/heplers");
const {
  KYC_STATUS,
  KYC_DOCUMENT_STATUS,
  KYC_DOCUMENT_TYPES,
} = require("../../constants/user");
const { sendTemplateEmail } = require("../../functions/nodemailer");
const referralService = require("../referral/referral.service");
const { REFERRAL_MILESTONES } = require("../../constants/referrals");

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

/**
 * Safely deletes a file from disk if it exists.
 */
function safeUnlink(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error("Error deleting file:", err);
    }
  }
}

async function uploadDocument(userId, documentType, fileUrl) {
  if (!Object.values(KYC_DOCUMENT_TYPES).includes(documentType)) {
    throw new Error(
      `Invalid document type. Allowed: ${Object.values(KYC_DOCUMENT_TYPES).join(", ")}`,
    );
  }

  if (!fileUrl) {
    throw new Error("fileUrl is required");
  }

  const isFileExist = await checkS3FileExists(fileUrl);
  if (!isFileExist) {
    throw new Error("File not found on S3.");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Initialize kycDocuments if not already present
  if (!user.kycDocuments) {
    user.kycDocuments = {};
  }

  const prevDoc = user.kycDocuments[documentType];
  if (
    prevDoc &&
    prevDoc.originalUrl &&
    prevDoc.originalUrl.startsWith("http") &&
    prevDoc.originalUrl.includes("amazonaws.com")
  ) {
    await deleteS3File(prevDoc.originalUrl);
  }

  // Set the document details — newly uploaded document resets to PENDING
  user.kycDocuments[documentType] = {
    originalUrl: fileUrl,
    compressedUrl: fileUrl,
    uploadedAt: new Date(),
    status: KYC_DOCUMENT_STATUS.PENDING,
    rejectionReason: null,
  };

  const docs = user.kycDocuments;
  const allUploaded =
    docs.aadhaar?.originalUrl &&
    docs.pan?.originalUrl &&
    docs.shopPhoto?.originalUrl;

  const anyRejected =
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
    }
  }

  await user.save();

  return {
    message: `${documentType.toUpperCase()} document uploaded successfully`,
    kycStatus: user.kycStatus,
    documents: normalizeKycDocuments(user.kycDocuments),
  };
}

function normalizeKycDocuments(kycDocuments) {
  const docTypes = Object.values(KYC_DOCUMENT_TYPES);
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
    kycStatus: user.kycStatus || KYC_STATUS.NOT_STARTED,
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

  const allCount = await User.countDocuments({
    kycStatus: { $ne: KYC_STATUS.NOT_STARTED },
  });
  const pendingCount = await User.countDocuments({
    kycStatus: KYC_STATUS.PENDING,
  });
  const approvedCount = await User.countDocuments({
    kycStatus: { $in: [KYC_STATUS.APPROVED, KYC_STATUS.VERIFIED] },
  });
  const rejectedCount = await User.countDocuments({
    kycStatus: KYC_STATUS.REJECTED,
  });

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

  if (
    ![KYC_DOCUMENT_STATUS.APPROVED, KYC_DOCUMENT_STATUS.REJECTED].includes(
      normalizedStatus,
    )
  ) {
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
      throw new Error(
        `Invalid document type. Allowed: ${Object.values(KYC_DOCUMENT_TYPES).join(", ")}`,
      );
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
      normalizedStatus === KYC_DOCUMENT_STATUS.REJECTED
        ? rejectionReason
        : null;

    // Bug 4 fix: Recalculate global kycStatus correctly for per-document reviews.
    // Only fall back to PENDING if all three documents are uploaded;
    // if some are missing, the overall status stays NOT_STARTED.
    const docs = user.kycDocuments;
    const allUploaded =
      docs.aadhaar?.originalUrl &&
      docs.pan?.originalUrl &&
      docs.shopPhoto?.originalUrl;
    const anyRejected =
      docs.aadhaar?.status === KYC_DOCUMENT_STATUS.REJECTED ||
      docs.pan?.status === KYC_DOCUMENT_STATUS.REJECTED ||
      docs.shopPhoto?.status === KYC_DOCUMENT_STATUS.REJECTED;

    const allApproved =
      docs.aadhaar?.status === KYC_DOCUMENT_STATUS.APPROVED &&
      docs.pan?.status === KYC_DOCUMENT_STATUS.APPROVED &&
      docs.shopPhoto?.status === KYC_DOCUMENT_STATUS.APPROVED;

    if (anyRejected) {
      user.kycStatus = KYC_STATUS.REJECTED;
    } else if (allApproved) {
      user.kycStatus = KYC_STATUS.APPROVED;
    } else if (allUploaded) {
      user.kycStatus = KYC_STATUS.PENDING;
    } else {
      user.kycStatus = KYC_STATUS.NOT_STARTED;
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

    // New Bug fix: Admin cannot approve KYC entirely if no documents have been uploaded
    if (
      normalizedStatus === KYC_DOCUMENT_STATUS.APPROVED &&
      !hasAtLeastOneDoc
    ) {
      throw new Error(
        "Cannot approve KYC entirely because no documents have been uploaded",
      );
    }

    // New Bug fix: Admin cannot reject KYC entirely unless all documents are uploaded
    if (normalizedStatus === KYC_DOCUMENT_STATUS.REJECTED && !allUploaded) {
      throw new Error(
        "Cannot reject KYC entirely because not all documents have been uploaded",
      );
    }

    const docTypes = Object.values(KYC_DOCUMENT_TYPES);
    docTypes.forEach((type) => {
      if (!user.kycDocuments[type]) {
        user.kycDocuments[type] = {};
      }
      user.kycDocuments[type].status = normalizedStatus;
      user.kycDocuments[type].rejectionReason =
        normalizedStatus === KYC_DOCUMENT_STATUS.REJECTED
          ? rejectionReason
          : null;
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
        const localizedNotif = getNotification(APP_NOTIFICATIONS.kyc.approved, user.language);
        const title = localizedNotif.title;
        const body = localizedNotif.body;
        sendFcmNotifications(user.fcmTokens, title, body).catch((err) =>
          console.error("[FCM] KYC approved notification failed:", err)
        );
        try {
          await referralService.completeMilestone(
            userId,
            REFERRAL_MILESTONES.KYC_VERIFICATION,
          );
        } catch (milestoneErr) {
          console.error("Error triggering KYC milestone:", milestoneErr);
        }
      } else if (user.kycStatus === KYC_STATUS.REJECTED) {
        const localizedNotif = getNotification(APP_NOTIFICATIONS.kyc.rejected, user.language);
        const title = localizedNotif.title;
        const body = formatNotification(localizedNotif.body, {
          reason: rejectionReason || "Information mismatch",
        });
        sendFcmNotifications(user.fcmTokens, title, body).catch((err) =>
          console.error("[FCM] KYC rejected notification failed:", err)
        );
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

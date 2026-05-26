const User = require("../../schemas/user.schema");
const path = require("path");
const sharp = require("sharp");
const fs = require("fs");
const { sendFcmNotifications } = require("../../functions/fcm");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const { formatNotification } = require("../../utils/heplers");

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

async function uploadDocument(userId, documentType, file) {
  if (!['aadhaar', 'pan', 'shopPhoto'].includes(documentType)) {
    if (file && file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('Error deleting file:', err);
      }
    }
    throw new Error('Invalid document type. Allowed: aadhaar, pan, shopPhoto');
  }

  if (!file) {
    throw new Error("No file uploaded");
  }

  // File type & extension validation
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'];
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (!allowedMimeTypes.includes(file.mimetype) || !allowedExtensions.includes(ext)) {
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('Error deleting invalid file type:', err);
      }
    }
    throw new Error('Invalid file type. Only JPG, JPEG, PNG, and PDF files are allowed.');
  }

  // File size validation (5MB max)
  const maxFileSize = 5 * 1024 * 1024;
  if (file.size > maxFileSize) {
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('Error deleting oversized file:', err);
      }
    }
    throw new Error('File size exceeds the 5MB limit.');
  }

  let compressedPath = null;
  try {
    // Compress the image
    const originalFilename = file.filename;
    const compressedFilename = await compressImage(file.path);

    if (compressedFilename !== file.filename) {
      const parsedPath = path.parse(file.path);
      compressedPath = path.join(parsedPath.dir, compressedFilename);
    }

    const originalUrl = `/uploads/images/${originalFilename}`;
    const compressedUrl = `/uploads/images/${compressedFilename}`;

    // Fetch user after compression completes to prevent race conditions
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Initialize kycDocuments if not already present
    if (!user.kycDocuments) {
      user.kycDocuments = {};
    }

    // Set the document details
    user.kycDocuments[documentType] = {
      originalUrl,
      compressedUrl,
      uploadedAt: new Date(),
      status: 'PENDING',
      rejectionReason: null
    };

    // Update overall status.
    const docs = user.kycDocuments;
    const allUploaded = docs.aadhaar?.originalUrl && docs.pan?.originalUrl && docs.shopPhoto?.originalUrl;

    const anyRejected =
      docs.aadhaar?.status === 'REJECTED' ||
      docs.pan?.status === 'REJECTED' ||
      docs.shopPhoto?.status === 'REJECTED';

    if (anyRejected) {
      user.kycStatus = 'REJECTED';
    } else if (allUploaded) {
      user.kycStatus = 'PENDING';
    } else {
      if (!user.kycStatus || user.kycStatus === 'NOT_STARTED') {
        user.kycStatus = 'NOT_STARTED';
      }
    }

    await user.save();

    return {
      message: `${documentType.toUpperCase()} document uploaded successfully`,
      kycStatus: user.kycStatus,
      documents: normalizeKycDocuments(user.kycDocuments),
    };
  } catch (error) {
    if (file && file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('Error deleting original file on error:', err);
      }
    }
    if (compressedPath && fs.existsSync(compressedPath)) {
      try {
        fs.unlinkSync(compressedPath);
      } catch (err) {
        console.error('Error deleting compressed file on error:', err);
      }
    }
    throw error;
  }
}

function normalizeKycDocuments(kycDocuments) {
  const docTypes = ['aadhaar', 'pan', 'shopPhoto'];
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
    kycStatus: user.kycStatus || 'NOT_STARTED',
    kycDocuments: normalizeKycDocuments(user.kycDocuments),
  };
}

async function getAdminKycList(filters = {}) {
  const query = {};
  if (filters.status) {
    query.kycStatus = filters.status;
  } else {
    query.kycStatus = { $ne: "NOT_STARTED" };
  }

  const users = await User.find(query)
    .select("name email kycStatus kycDocuments updatedAt")
    .sort({ updatedAt: -1 });

  const allCount = await User.countDocuments({ kycStatus: { $ne: 'NOT_STARTED' } });
  const pendingCount = await User.countDocuments({ kycStatus: 'PENDING' });
  const approvedCount = await User.countDocuments({ kycStatus: { $in: ['APPROVED', 'VERIFIED'] } });
  const rejectedCount = await User.countDocuments({ kycStatus: 'REJECTED' });

  return {
    users,
    counts: {
      all: allCount,
      PENDING: pendingCount,
      APPROVED: approvedCount,
      REJECTED: rejectedCount
    }
  };
}

async function reviewKycDocument(
  userId,
  { documentType, status, rejectionReason },
) {
  let normalizedStatus = status.toUpperCase();
  if (normalizedStatus === "VERIFIED") {
    normalizedStatus = "APPROVED";
  }

  if (!["APPROVED", "REJECTED"].includes(normalizedStatus)) {
    throw new Error(
      "Invalid review status. Allowed: APPROVED, VERIFIED, REJECTED",
    );
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (documentType) {
    if (!["aadhaar", "pan", "shopPhoto"].includes(documentType)) {
      throw new Error(
        "Invalid document type. Allowed: aadhaar, pan, shopPhoto",
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
      normalizedStatus === "REJECTED" ? rejectionReason : null;

    // Recalculate global kycStatus based on individual documents
    const docs = user.kycDocuments;
    const allUploaded = docs.aadhaar?.originalUrl && docs.pan?.originalUrl && docs.shopPhoto?.originalUrl;
    
    const anyRejected = 
      docs.aadhaar?.status === 'REJECTED' || 
      docs.pan?.status === 'REJECTED' || 
      docs.shopPhoto?.status === 'REJECTED';

    const allApproved =
      docs.aadhaar?.status === "APPROVED" &&
      docs.pan?.status === "APPROVED" &&
      docs.shopPhoto?.status === "APPROVED";

    if (anyRejected) {
      user.kycStatus = "REJECTED";
    } else if (allApproved) {
      user.kycStatus = 'APPROVED';
    } else if (allUploaded) {
      user.kycStatus = 'PENDING';
    } else {
      user.kycStatus = 'NOT_STARTED';
    }
  } else {
    // Global review
    if (!user.kycDocuments) {
      user.kycDocuments = {
        aadhaar: {},
        pan: {},
        shopPhoto: {},
      };
    }

    const docs = user.kycDocuments;
    const allUploaded = docs.aadhaar?.originalUrl && docs.pan?.originalUrl && docs.shopPhoto?.originalUrl;
    const hasAtLeastOneDoc = docs.aadhaar?.originalUrl || docs.pan?.originalUrl || docs.shopPhoto?.originalUrl;

    if (normalizedStatus === 'APPROVED' && !hasAtLeastOneDoc) {
      throw new Error('Cannot approve KYC entirely because no documents have been uploaded');
    }

    if (normalizedStatus === 'REJECTED' && !allUploaded) {
      throw new Error('Cannot reject KYC entirely because not all documents have been uploaded');
    }



    const docTypes = ["aadhaar", "pan", "shopPhoto"];
    docTypes.forEach((type) => {
      if (!user.kycDocuments[type]) {
        user.kycDocuments[type] = {};
      }
      user.kycDocuments[type].status = normalizedStatus;
      user.kycDocuments[type].rejectionReason =
        normalizedStatus === "REJECTED" ? rejectionReason : null;
      if (
        normalizedStatus === "APPROVED" &&
        !user.kycDocuments[type].uploadedAt
      ) {
        user.kycDocuments[type].uploadedAt = new Date();
      }
    });

    user.kycStatus = normalizedStatus;
  }

  await user.save();

  // Trigger notification integration
  if (user.fcmTokens?.length && user.enableNotification) {
    try {
      if (user.kycStatus === "APPROVED") {
        const title = APP_NOTIFICATIONS.kyc.approved.title;
        const body = APP_NOTIFICATIONS.kyc.approved.body;
        await sendFcmNotifications(user.fcmTokens, title, body);
      } else if (user.kycStatus === "REJECTED") {
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

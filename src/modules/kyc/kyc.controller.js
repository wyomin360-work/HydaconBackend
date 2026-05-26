const fs = require("fs");
const kycService = require("./kyc.service");
const { sendResponse, sendFailResponse } = require("../../utils/responseHandlers");

/**
 * Deletes any files uploaded by multer from disk.
 * Called when validation fails or the service throws an error to prevent orphaned uploads.
 */
const deleteUploadedFiles = (req) => {
  if (req.file && req.file.path && fs.existsSync(req.file.path)) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (err) {
      console.error("Error deleting file:", err);
    }
  }
  if (req.files) {
    Object.keys(req.files).forEach((key) => {
      const files = req.files[key];
      if (Array.isArray(files)) {
        files.forEach((file) => {
          if (file.path && fs.existsSync(file.path)) {
            try {
              fs.unlinkSync(file.path);
            } catch (err) {
              console.error("Error deleting file:", err);
            }
          }
        });
      }
    });
  }
};

exports.uploadKycDocument = async (req, res) => {
  const userId = req.userId;
  const { documentType } = req.body;
  // Support both single file uploads (req.file) and field uploads (req.files)
  const file = req.file || (req.files && (req.files['document']?.[0] || req.files['image']?.[0]));

  try {
    if (!documentType) {
      sendFailResponse("documentType is required in the request body (aadhaar, pan, or shopPhoto)");
    }
    if (!file) {
      sendFailResponse("Please select a document file to upload");
    }

    const result = await kycService.uploadDocument(userId, documentType, file);
    return sendResponse(res, result);
  } catch (error) {
    // Cleanup any uploaded files on failure (Bug 1 fix)
    deleteUploadedFiles(req);
    throw error;
  }
};

exports.getKycStatus = async (req, res) => {
  const userId = req.userId;
  const result = await kycService.getKycStatus(userId);
  return sendResponse(res, result);
};

exports.getAdminKycList = async (req, res) => {
  const filters = req.query;
  const result = await kycService.getAdminKycList(filters);
  return sendResponse(res, result);
};

exports.reviewKycDocument = async (req, res) => {
  const { userId } = req.params;
  const { documentType, status, rejectionReason } = req.body;

  if (!status) {
    return sendFailResponse("status is required in request body (APPROVED, VERIFIED, REJECTED)");
  }

  if (documentType && !['aadhaar', 'pan', 'shopPhoto'].includes(documentType)) {
    return sendFailResponse("Invalid documentType. Allowed: aadhaar, pan, shopPhoto");
  }

  if (status === 'REJECTED' && !rejectionReason) {
    return sendFailResponse("rejectionReason is required when status is REJECTED");
  }

  const result = await kycService.reviewKycDocument(userId, { documentType, status, rejectionReason });
  return sendResponse(res, result);
};

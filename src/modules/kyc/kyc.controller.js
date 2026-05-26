const kycService = require("./kyc.service");
const {
  sendResponse,
  sendFailResponse,
} = require("../../utils/responseHandlers");

exports.uploadKycDocument = async (req, res) => {
  const userId = req.userId;
  const { documentType } = req.body;
  // Support both single file uploads (req.file) and field uploads (req.files)
  const file =
    req.file ||
    (req.files && (req.files["document"]?.[0] || req.files["image"]?.[0]));

  if (!documentType) {
    return sendFailResponse(
      "documentType is required in the request body (aadhaar, pan, or shopPhoto)",
    );
  }
  if (!file) {
    return sendFailResponse("Please select a document file to upload");
  }

  const result = await kycService.uploadDocument(userId, documentType, file);
  return sendResponse(res, result);
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
    return sendFailResponse(
      "status is required in request body (APPROVED, VERIFIED, REJECTED)",
    );
  }

  if (documentType && !["aadhaar", "pan", "shopPhoto"].includes(documentType)) {
    return sendFailResponse(
      "Invalid documentType. Allowed: aadhaar, pan, shopPhoto",
    );
  }

  if (status === "REJECTED" && !rejectionReason) {
    return sendFailResponse(
      "rejectionReason is required when status is REJECTED",
    );
  }

  const result = await kycService.reviewKycDocument(userId, {
    documentType,
    status,
    rejectionReason,
  });
  return sendResponse(res, result);
};

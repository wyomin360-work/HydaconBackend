jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock("../../src/functions/nodemailer", () => ({
  sendMail: jest.fn().mockResolvedValue(true),
  sendTemplateEmail: jest.fn().mockResolvedValue(true),
}));

const kycService = require("../../src/modules/kyc/kyc.service");
const User = require("../../src/schemas/user.schema");
const fs = require("fs");

jest.mock("../../src/schemas/user.schema");

jest.mock("sharp", () => {
  return jest.fn().mockReturnValue({
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    toFile: jest.fn().mockResolvedValue({}),
  });
});

jest.mock("fs", () => ({
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

describe("kyc.service unit tests", () => {
  let mockFile;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFile = {
      filename: "test-doc.jpg",
      originalname: "test-doc.jpg",
      path: "/tmp/uploads/test-doc.jpg",
      mimetype: "image/jpeg",
      size: 1024 * 1024, // 1MB
    };
  });

  describe("uploadDocument", () => {
    it("should throw error and clean up original file if document type is invalid", async () => {
      fs.existsSync.mockReturnValue(true);

      await expect(
        kycService.uploadDocument("userId123", "invalidType", mockFile)
      ).rejects.toThrow("Invalid document type");

      expect(fs.existsSync).toHaveBeenCalledWith(mockFile.path);
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockFile.path);
    });

    it("should throw error and clean up original file if mime type is invalid", async () => {
      mockFile.mimetype = "text/plain";
      mockFile.originalname = "test.txt";
      fs.existsSync.mockReturnValue(true);

      await expect(
        kycService.uploadDocument("userId123", "aadhaar", mockFile)
      ).rejects.toThrow("Invalid file type");

      expect(fs.existsSync).toHaveBeenCalledWith(mockFile.path);
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockFile.path);
    });

    it("should throw error and clean up original file if file size exceeds max size", async () => {
      mockFile.size = 6 * 1024 * 1024; // 6MB
      fs.existsSync.mockReturnValue(true);

      await expect(
        kycService.uploadDocument("userId123", "aadhaar", mockFile)
      ).rejects.toThrow("File size exceeds");

      expect(fs.existsSync).toHaveBeenCalledWith(mockFile.path);
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockFile.path);
    });

    it("should clean up original and compressed files if user is not found", async () => {
      fs.existsSync.mockReturnValue(true);
      User.findById.mockResolvedValue(null);

      await expect(
        kycService.uploadDocument("userId123", "aadhaar", mockFile)
      ).rejects.toThrow("User not found");

      expect(fs.unlinkSync).toHaveBeenCalledWith(mockFile.path);
      // It should also try to clean up the compressed file
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining("test-doc-compressed")
      );
    });

    it("should upload first document and set status to NOT_STARTED since others are missing", async () => {
      const mockUser = {
        kycDocuments: {},
        kycStatus: "NOT_STARTED",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      const result = await kycService.uploadDocument("userId123", "aadhaar", mockFile);

      expect(mockUser.kycDocuments.aadhaar).toBeDefined();
      expect(mockUser.kycDocuments.aadhaar.status).toBe("PENDING");
      expect(mockUser.kycStatus).toBe("NOT_STARTED");
      expect(mockUser.save).toHaveBeenCalled();
      expect(result.kycStatus).toBe("NOT_STARTED");
    });

    it("should transition to PENDING if all three documents are uploaded and none are rejected", async () => {
      const mockUser = {
        kycDocuments: {
          pan: { originalUrl: "/uploads/images/pan.jpg", status: "APPROVED" },
          shopPhoto: { originalUrl: "/uploads/images/shop.jpg", status: "PENDING" },
        },
        kycStatus: "NOT_STARTED",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      const result = await kycService.uploadDocument("userId123", "aadhaar", mockFile);

      expect(mockUser.kycStatus).toBe("PENDING");
      expect(result.kycStatus).toBe("PENDING");
    });

    it("should remain REJECTED on re-upload of one document if another is still rejected (Bug 3 Fix)", async () => {
      const mockUser = {
        kycDocuments: {
          aadhaar: { originalUrl: "/uploads/images/aadhaar.jpg", status: "REJECTED" },
          pan: { originalUrl: "/uploads/images/pan.jpg", status: "REJECTED" },
          shopPhoto: { originalUrl: "/uploads/images/shop.jpg", status: "APPROVED" },
        },
        kycStatus: "REJECTED",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      // Re-upload aadhaar document
      const result = await kycService.uploadDocument("userId123", "aadhaar", mockFile);

      // aadhaar should become PENDING, but pan is still REJECTED.
      // So kycStatus must remain REJECTED.
      expect(mockUser.kycDocuments.aadhaar.status).toBe("PENDING");
      expect(mockUser.kycDocuments.pan.status).toBe("REJECTED");
      expect(mockUser.kycStatus).toBe("REJECTED");
      expect(result.kycStatus).toBe("REJECTED");
    });

    it("should transition to PENDING on re-upload if no documents remain rejected", async () => {
      const mockUser = {
        kycDocuments: {
          aadhaar: { originalUrl: "/uploads/images/aadhaar.jpg", status: "PENDING" },
          pan: { originalUrl: "/uploads/images/pan.jpg", status: "REJECTED" },
          shopPhoto: { originalUrl: "/uploads/images/shop.jpg", status: "APPROVED" },
        },
        kycStatus: "REJECTED",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      // Re-upload pan document (which was the rejected one)
      const result = await kycService.uploadDocument("userId123", "pan", mockFile);

      expect(mockUser.kycDocuments.pan.status).toBe("PENDING");
      expect(mockUser.kycStatus).toBe("PENDING");
      expect(result.kycStatus).toBe("PENDING");
    });
  });

  describe("reviewKycDocument", () => {
    it("should set status to APPROVED if all documents are approved", async () => {
      const mockUser = {
        kycDocuments: {
          aadhaar: { originalUrl: "/uploads/images/aadhaar.jpg", status: "APPROVED" },
          pan: { originalUrl: "/uploads/images/pan.jpg", status: "PENDING" },
          shopPhoto: { originalUrl: "/uploads/images/shop.jpg", status: "APPROVED" },
        },
        kycStatus: "PENDING",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      const result = await kycService.reviewKycDocument("userId123", {
        documentType: "pan",
        status: "APPROVED",
      });

      expect(mockUser.kycDocuments.pan.status).toBe("APPROVED");
      expect(mockUser.kycStatus).toBe("APPROVED");
    });

    it("should set status to REJECTED if any document is rejected", async () => {
      const mockUser = {
        kycDocuments: {
          aadhaar: { originalUrl: "/uploads/images/aadhaar.jpg", status: "APPROVED" },
          pan: { originalUrl: "/uploads/images/pan.jpg", status: "PENDING" },
          shopPhoto: { originalUrl: "/uploads/images/shop.jpg", status: "APPROVED" },
        },
        kycStatus: "PENDING",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      const result = await kycService.reviewKycDocument("userId123", {
        documentType: "pan",
        status: "REJECTED",
        rejectionReason: "illegible",
      });

      expect(mockUser.kycDocuments.pan.status).toBe("REJECTED");
      expect(mockUser.kycStatus).toBe("REJECTED");
    });

    it("should set status to NOT_STARTED when single document is approved but others are missing (Bug 4 Fix)", async () => {
      const mockUser = {
        kycDocuments: {
          aadhaar: { originalUrl: "/uploads/images/aadhaar.jpg", status: "PENDING" },
          // pan and shopPhoto are missing
        },
        kycStatus: "NOT_STARTED",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      const result = await kycService.reviewKycDocument("userId123", {
        documentType: "aadhaar",
        status: "APPROVED",
      });

      expect(mockUser.kycDocuments.aadhaar.status).toBe("APPROVED");
      // Since pan and shopPhoto originalUrls are missing, kycStatus should remain NOT_STARTED instead of transitioning to PENDING
      expect(mockUser.kycStatus).toBe("NOT_STARTED");
    });

    it("should set status to PENDING when single document is approved, others are not approved but are uploaded", async () => {
      const mockUser = {
        kycDocuments: {
          aadhaar: { originalUrl: "/uploads/images/aadhaar.jpg", status: "PENDING" },
          pan: { originalUrl: "/uploads/images/pan.jpg", status: "PENDING" },
          shopPhoto: { originalUrl: "/uploads/images/shop.jpg", status: "PENDING" },
        },
        kycStatus: "PENDING",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      const result = await kycService.reviewKycDocument("userId123", {
        documentType: "aadhaar",
        status: "APPROVED",
      });

      expect(mockUser.kycDocuments.aadhaar.status).toBe("APPROVED");
      // Since all 3 are uploaded, but pan and shopPhoto are still pending, kycStatus should remain PENDING
      expect(mockUser.kycStatus).toBe("PENDING");
    });

    it("should throw an error if admin tries to approve KYC entirely when no documents have been uploaded", async () => {
      const mockUser = {
        kycDocuments: {
          aadhaar: {},
          pan: {},
          shopPhoto: {},
        },
        kycStatus: "NOT_STARTED",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      await expect(
        kycService.reviewKycDocument("userId123", {
          status: "APPROVED",
        })
      ).rejects.toThrow("Cannot approve KYC entirely because no documents have been uploaded");
    });

    it("should allow admin to approve KYC entirely if at least one document is uploaded", async () => {
      const mockUser = {
        kycDocuments: {
          aadhaar: { originalUrl: "/uploads/images/aadhaar.jpg" },
          pan: {},
          shopPhoto: {},
        },
        kycStatus: "NOT_STARTED",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      const result = await kycService.reviewKycDocument("userId123", {
        status: "APPROVED",
      });

      expect(mockUser.kycStatus).toBe("APPROVED");
    });

    it("should throw an error if admin tries to reject KYC entirely when not all documents have been uploaded", async () => {
      const mockUser = {
        kycDocuments: {
          aadhaar: { originalUrl: "/uploads/images/aadhaar.jpg" },
          pan: {},
          shopPhoto: {},
        },
        kycStatus: "NOT_STARTED",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      await expect(
        kycService.reviewKycDocument("userId123", {
          status: "REJECTED",
          rejectionReason: "incomplete profile documents",
        })
      ).rejects.toThrow("Cannot reject KYC entirely because not all documents have been uploaded");
    });

    it("should allow admin to reject KYC entirely if all documents are uploaded", async () => {
      const mockUser = {
        kycDocuments: {
          aadhaar: { originalUrl: "/uploads/images/aadhaar.jpg" },
          pan: { originalUrl: "/uploads/images/pan.jpg" },
          shopPhoto: { originalUrl: "/uploads/images/shop.jpg" },
        },
        kycStatus: "PENDING",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      const result = await kycService.reviewKycDocument("userId123", {
        status: "REJECTED",
        rejectionReason: "bad quality scans",
      });

      expect(mockUser.kycStatus).toBe("REJECTED");
    });

    it("should send approval email if user.email is set and KYC is APPROVED", async () => {
      const mockUser = {
        email: "user@example.com",
        name: "Test User",
        kycDocuments: {
          aadhaar: { originalUrl: "/uploads/images/aadhaar.jpg", status: "APPROVED" },
          pan: { originalUrl: "/uploads/images/pan.jpg", status: "PENDING" },
          shopPhoto: { originalUrl: "/uploads/images/shop.jpg", status: "APPROVED" },
        },
        kycStatus: "PENDING",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      const { sendTemplateEmail } = require("../../src/functions/nodemailer");
      sendTemplateEmail.mockClear();

      await kycService.reviewKycDocument("userId123", {
        documentType: "pan",
        status: "APPROVED",
      });

      expect(sendTemplateEmail).toHaveBeenCalledTimes(1);
      expect(sendTemplateEmail).toHaveBeenCalledWith(
        "user@example.com",
        "users/kycApproved",
        "KYC Verified Successfully 🎉",
        expect.objectContaining({
          userName: "Test User",
        })
      );
    });

    it("should send rejection email if user.email is set and KYC is REJECTED", async () => {
      const mockUser = {
        email: "user@example.com",
        name: "Test User",
        kycDocuments: {
          aadhaar: { originalUrl: "/uploads/images/aadhaar.jpg", status: "APPROVED" },
          pan: { originalUrl: "/uploads/images/pan.jpg", status: "PENDING" },
          shopPhoto: { originalUrl: "/uploads/images/shop.jpg", status: "APPROVED" },
        },
        kycStatus: "PENDING",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      const { sendTemplateEmail } = require("../../src/functions/nodemailer");
      sendTemplateEmail.mockClear();

      await kycService.reviewKycDocument("userId123", {
        documentType: "pan",
        status: "REJECTED",
        rejectionReason: "ID blurry",
      });

      expect(sendTemplateEmail).toHaveBeenCalledTimes(1);
      expect(sendTemplateEmail).toHaveBeenCalledWith(
        "user@example.com",
        "users/kycRejected",
        "KYC Verification Failed ⚠️",
        expect.objectContaining({
          userName: "Test User",
          rejectionReason: "ID blurry",
        })
      );
    });

    it("should not send email if user.email is not set", async () => {
      const mockUser = {
        name: "Test User",
        kycDocuments: {
          aadhaar: { originalUrl: "/uploads/images/aadhaar.jpg", status: "APPROVED" },
          pan: { originalUrl: "/uploads/images/pan.jpg", status: "PENDING" },
          shopPhoto: { originalUrl: "/uploads/images/shop.jpg", status: "APPROVED" },
        },
        kycStatus: "PENDING",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      const { sendTemplateEmail } = require("../../src/functions/nodemailer");
      sendTemplateEmail.mockClear();

      await kycService.reviewKycDocument("userId123", {
        documentType: "pan",
        status: "APPROVED",
      });

      expect(sendTemplateEmail).not.toHaveBeenCalled();
    });
  });
});

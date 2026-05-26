jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
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

  // ─── uploadDocument ──────────────────────────────────────────────────────────

  describe("uploadDocument", () => {
    it("Bug 1: should throw and clean up file if document type is invalid", async () => {
      fs.existsSync.mockReturnValue(true);

      await expect(
        kycService.uploadDocument("userId123", "invalidType", mockFile)
      ).rejects.toThrow("Invalid document type");

      expect(fs.existsSync).toHaveBeenCalledWith(mockFile.path);
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockFile.path);
    });

    it("Bug 1: should throw and clean up file if mime type is invalid", async () => {
      mockFile.mimetype = "text/plain";
      mockFile.originalname = "test.txt";
      fs.existsSync.mockReturnValue(true);

      await expect(
        kycService.uploadDocument("userId123", "aadhaar", mockFile)
      ).rejects.toThrow("Invalid file type");

      expect(fs.existsSync).toHaveBeenCalledWith(mockFile.path);
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockFile.path);
    });

    it("Bug 1: should throw and clean up file if file size exceeds 5MB", async () => {
      mockFile.size = 6 * 1024 * 1024;
      fs.existsSync.mockReturnValue(true);

      await expect(
        kycService.uploadDocument("userId123", "aadhaar", mockFile)
      ).rejects.toThrow("File size exceeds");

      expect(fs.existsSync).toHaveBeenCalledWith(mockFile.path);
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockFile.path);
    });

    it("Bug 1 & 2: should clean up original and compressed files if user is not found (after compression)", async () => {
      fs.existsSync.mockReturnValue(true);
      // Compression runs first (Bug 2), then user lookup fails
      User.findById.mockResolvedValue(null);

      await expect(
        kycService.uploadDocument("userId123", "aadhaar", mockFile)
      ).rejects.toThrow("User not found");

      // Original file should be unlinked
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockFile.path);
      // Compressed file path should also be attempted
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining("test-doc-compressed")
      );
    });

    it("should upload first document and keep status NOT_STARTED (others missing)", async () => {
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
      expect(result.kycStatus).toBe("NOT_STARTED");
    });

    it("should transition to PENDING when all three documents are uploaded and none are rejected", async () => {
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

    it("Bug 3: should remain REJECTED when re-uploading one doc if another is still REJECTED", async () => {
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

      // Re-upload aadhaar — it becomes PENDING, but pan is still REJECTED
      const result = await kycService.uploadDocument("userId123", "aadhaar", mockFile);

      expect(mockUser.kycDocuments.aadhaar.status).toBe("PENDING");
      expect(mockUser.kycDocuments.pan.status).toBe("REJECTED");
      expect(mockUser.kycStatus).toBe("REJECTED"); // Must stay REJECTED
      expect(result.kycStatus).toBe("REJECTED");
    });

    it("Bug 3: should move to PENDING on re-upload if no documents remain rejected", async () => {
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

      // Re-upload pan (the only remaining rejected doc)
      const result = await kycService.uploadDocument("userId123", "pan", mockFile);

      expect(mockUser.kycDocuments.pan.status).toBe("PENDING");
      expect(mockUser.kycStatus).toBe("PENDING");
      expect(result.kycStatus).toBe("PENDING");
    });
  });

  // ─── reviewKycDocument ───────────────────────────────────────────────────────

  describe("reviewKycDocument", () => {
    it("should set status to APPROVED if all three documents are approved", async () => {
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

      await kycService.reviewKycDocument("userId123", {
        documentType: "pan",
        status: "APPROVED",
      });

      expect(mockUser.kycDocuments.pan.status).toBe("APPROVED");
      expect(mockUser.kycStatus).toBe("APPROVED");
    });

    it("should set kycStatus to REJECTED if any document is rejected", async () => {
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

      await kycService.reviewKycDocument("userId123", {
        documentType: "pan",
        status: "REJECTED",
        rejectionReason: "illegible",
      });

      expect(mockUser.kycDocuments.pan.status).toBe("REJECTED");
      expect(mockUser.kycStatus).toBe("REJECTED");
    });

    it("Bug 4: should set kycStatus to NOT_STARTED when single doc is approved but others are missing", async () => {
      const mockUser = {
        kycDocuments: {
          aadhaar: { originalUrl: "/uploads/images/aadhaar.jpg", status: "PENDING" },
          // pan and shopPhoto not uploaded
        },
        kycStatus: "NOT_STARTED",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      await kycService.reviewKycDocument("userId123", {
        documentType: "aadhaar",
        status: "APPROVED",
      });

      expect(mockUser.kycDocuments.aadhaar.status).toBe("APPROVED");
      // Should NOT become PENDING — docs are missing
      expect(mockUser.kycStatus).toBe("NOT_STARTED");
    });

    it("Bug 4: should stay PENDING when single doc approved but others are uploaded-not-approved", async () => {
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

      await kycService.reviewKycDocument("userId123", {
        documentType: "aadhaar",
        status: "APPROVED",
      });

      expect(mockUser.kycDocuments.aadhaar.status).toBe("APPROVED");
      expect(mockUser.kycStatus).toBe("PENDING");
    });

    // ── Global review (no documentType) ─────────────────────────────────────

    it("New Bug: should throw if admin tries to APPROVE KYC globally with no docs uploaded", async () => {
      const mockUser = {
        kycDocuments: { aadhaar: {}, pan: {}, shopPhoto: {} },
        kycStatus: "NOT_STARTED",
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(mockUser);

      await expect(
        kycService.reviewKycDocument("userId123", { status: "APPROVED" })
      ).rejects.toThrow("Cannot approve KYC entirely because no documents have been uploaded");
    });

    it("New Bug: should allow admin to APPROVE KYC globally if at least one doc is uploaded", async () => {
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

      await kycService.reviewKycDocument("userId123", { status: "APPROVED" });

      expect(mockUser.kycStatus).toBe("APPROVED");
    });

    it("New Bug: should throw if admin tries to REJECT KYC globally when not all docs are uploaded", async () => {
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
          rejectionReason: "incomplete documents",
        })
      ).rejects.toThrow("Cannot reject KYC entirely because not all documents have been uploaded");
    });

    it("New Bug: should allow admin to REJECT KYC globally when all docs are uploaded", async () => {
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

      await kycService.reviewKycDocument("userId123", {
        status: "REJECTED",
        rejectionReason: "bad quality scans",
      });

      expect(mockUser.kycStatus).toBe("REJECTED");
    });
  });
});

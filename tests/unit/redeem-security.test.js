const { createRedeem } = require("../../src/modules/redeems/redeems.service");
const { releaseBan } = require("../../src/modules/user/user.service");
const User = require("../../src/schemas/user.schema");
const Reward = require("../../src/schemas/reward.schema");
const Product = require("../../src/schemas/product.schema");
const AppConfig = require("../../src/schemas/app-config.schema");

// Mocking dependencies
jest.mock("../../src/schemas/user.schema");
jest.mock("../../src/schemas/reward.schema");
jest.mock("../../src/schemas/product.schema");
jest.mock("../../src/schemas/app-config.schema");
jest.mock("../../src/schemas/redeem.schema", () => {
  return {
    create: jest.fn().mockResolvedValue({ _id: "redeem123" }),
  };
});
jest.mock("../../src/schemas/tier-configuration.schema", () => ({
  findOne: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue({ pointMultiplier: 1.0 }),
  }),
}));
jest.mock("../../src/functions/fcm", () => ({
  sendFcmNotifications: jest.fn(),
}));
jest.mock("../../src/modules/loyalty/loyalty.service", () => ({
  getOrCreateUserProgress: jest.fn().mockResolvedValue(null),
  processQrScanPoints: jest.fn().mockResolvedValue(true),
  resolveActiveSeason: jest.fn().mockResolvedValue(null),
}));

describe("Redeem Security & Ban Logic", () => {
  let mockUser, mockConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockUser = {
      _id: "user123",
      kycStatus: "APPROVED",
      failedScanAttempts: 0,
      scanBanUntil: null,
      save: jest.fn().mockResolvedValue(true),
    };

    mockConfig = {
      securitySettings: {
        autoBanEnabled: true,
        scanCountForBan: 3,
      },
    };

    User.findById = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockUser),
    });
    User.findByIdAndUpdate = jest.fn().mockResolvedValue(true);
    AppConfig.findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockConfig),
    });
  });

  describe("Auto-Ban System", () => {
    it("should ban the user if they reach the scanCountForBan limit with invalid codes", async () => {
      // Simulate an invalid reward scan
      Reward.findOne = jest.fn().mockResolvedValue(null);

      // Start at 2 failed attempts (limit is 3)
      mockUser.failedScanAttempts = 2;

      const reqBody = {
        userId: "user123",
        rewardUidCode: "INVALID123",
      };

      try {
        await createRedeem(reqBody, mockUser);
      } catch (err) {
        expect(err.message).toBe("reward not found or invalid code");
      }

      expect(mockUser.failedScanAttempts).toBe(0); // Should reset after ban
      expect(mockUser.scanBanUntil).toBeInstanceOf(Date);
      expect(mockUser.scanBanUntil.getTime()).toBeGreaterThan(Date.now()); // Ban is in the future
      expect(mockUser.save).toHaveBeenCalled();
    });

    it("should reset the ban count if there is a successful redemption", async () => {
      // Simulate valid reward and product
      Reward.findOne = jest.fn().mockResolvedValue({
        _id: "reward123",
        productId: "prod123",
        active: true,
        isRedeemed: false,
        expiresAt: new Date(Date.now() + 100000),
        point: 10,
        save: jest.fn().mockResolvedValue(true),
      });

      Product.findById = jest.fn().mockResolvedValue({
        _id: "prod123",
        name: "Test Product",
      });

      // User starts with 2 failed attempts
      mockUser.failedScanAttempts = 2;

      const reqBody = {
        userId: "user123",
        rewardUidCode: "VALID123",
      };

      const result = await createRedeem(reqBody, mockUser);

      expect(result.message).toBe("redeem successful");
      // Assert the atomic update resets the counters
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        "user123",
        expect.objectContaining({
          $set: { failedScanAttempts: 0, scanBanUntil: null },
        }),
      );
    });
  });

  describe("Admin Ban Release", () => {
    it("should allow an admin to release a user's ban", async () => {
      // releaseBan doesn't use populate, so mock findById directly
      User.findById = jest.fn().mockResolvedValue(mockUser);

      // User is currently banned
      mockUser.scanBanUntil = new Date(Date.now() + 10000);
      mockUser.failedScanAttempts = 5;

      const result = await releaseBan("user123");

      expect(result.message).toBe("Ban released successfully");
      expect(mockUser.scanBanUntil).toBeNull();
      expect(mockUser.failedScanAttempts).toBe(0);
      expect(mockUser.save).toHaveBeenCalled();
    });
  });
});

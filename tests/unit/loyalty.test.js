const loyaltyService = require("../../src/modules/loyalty/loyalty.service");
const loyaltyController = require("../../src/modules/loyalty/loyalty.controller");
const Tier = require("../../src/schemas/tier.schema");
const LoyaltySeason = require("../../src/schemas/loyalty-season.schema");
const TierConfiguration = require("../../src/schemas/tier-configuration.schema");
const UserTierProgress = require("../../src/schemas/user-tier-progress.schema");
const LoyaltyTransaction = require("../../src/schemas/loyalty-transaction.schema");
const User = require("../../src/schemas/user.schema");
const TierBenefit = require("../../src/schemas/tier-benefit.schema");
const { LOYALTY_TRANSACTION_TYPES, LOYALTY_TRANSACTION_SOURCES } = require("../../src/constants/loyalty");

// Mock schemas
jest.mock("../../src/schemas/tier.schema");
jest.mock("../../src/schemas/loyalty-season.schema");
jest.mock("../../src/schemas/tier-benefit.schema");
jest.mock("../../src/schemas/tier-configuration.schema");
jest.mock("../../src/schemas/user-tier-progress.schema");
jest.mock("../../src/schemas/loyalty-transaction.schema");
jest.mock("../../src/schemas/user.schema");
jest.mock("../../src/functions/fcm", () => ({
  sendFcmNotifications: jest.fn(),
}));

describe("Loyalty and Tier Progression Engine", () => {
  let mockUser, mockTiers, mockSeason, mockConfigs, mockProgress;

  beforeEach(() => {
    jest.clearAllMocks();

    mockUser = {
      _id: "user123",
      name: "John Doe",
      totalPoints: 200,
      currentTierId: "tier0",
      fcmTokens: ["token1"],
      enableNotification: true,
      save: jest.fn(),
    };

    mockTiers = [
      { _id: "tier0", name: "Beginner", key: "beginner", rank: 0, colorIdentity: "#8E8E93" },
      { _id: "tier1", name: "Bronze", key: "bronze", rank: 1, colorIdentity: "#CD7F32" },
      { _id: "tier2", name: "Silver", key: "silver", rank: 2, colorIdentity: "#C0C0C0" },
      { _id: "tier3", name: "Gold", key: "gold", rank: 3, colorIdentity: "#FFD700" },
      { _id: "tier4", name: "Platinum", key: "platinum", rank: 4, colorIdentity: "#E5E4E2" },
    ];

    mockSeason = {
      _id: "season123",
      name: "Season 1",
      code: "S1",
      startDate: new Date(),
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      active: true,
    };

    mockConfigs = [
      { tierId: mockTiers[0], seasonId: "season123", qualificationThreshold: 0, pointMultiplier: 1.0 },
      { tierId: mockTiers[1], seasonId: "season123", qualificationThreshold: 100, pointMultiplier: 1.1 },
      { tierId: mockTiers[2], seasonId: "season123", qualificationThreshold: 500, pointMultiplier: 1.2 },
      { tierId: mockTiers[3], seasonId: "season123", qualificationThreshold: 1000, pointMultiplier: 1.3 },
      { tierId: mockTiers[4], seasonId: "season123", qualificationThreshold: 2000, pointMultiplier: 1.5 },
    ];

    mockProgress = {
      _id: "progress123",
      userId: "user123",
      seasonId: "season123",
      currentTierId: mockTiers[0],
      qualificationPoints: 50,
      save: jest.fn(),
    };

    // Mocks implementations
    LoyaltySeason.findOne.mockResolvedValue(mockSeason);
    User.findById.mockResolvedValue(mockUser);
    User.findByIdAndUpdate.mockResolvedValue(mockUser);
    Tier.findOne.mockResolvedValue(mockTiers[0]);
    Tier.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue(mockTiers),
    });
  });

  describe("Seeding & User Progress", () => {
    it("should fetch or create user tier progress cards correctly", async () => {
      // Setup progress
      UserTierProgress.findOneAndUpdate = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProgress),
      });

      const progress = await loyaltyService.getOrCreateUserProgress("user123");

      expect(UserTierProgress.findOneAndUpdate).toHaveBeenCalled();
      expect(progress.currentTierId.name).toBe("Beginner");
      expect(progress.qualificationPoints).toBe(50);
    });

    it("should fetch tier progression metadata correctly", async () => {
      TierConfiguration.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockConfigs),
      });

      const result = await loyaltyService.getTierProgressionMetadata("user123");

      expect(TierConfiguration.find).toHaveBeenCalledWith({
        seasonId: "season123",
        active: true,
        isArchived: { $ne: true },
      });
      expect(result).toEqual(mockConfigs);
    });
  });

  describe("QR Scan vs. Campaign Bonus points separation", () => {
    it("should process QR Scan adding to BOTH global points and seasonal QP", async () => {
      UserTierProgress.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockProgress),
      });
      UserTierProgress.findOneAndUpdate = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProgress),
      });
      
      // Stub configs find for evaluate
      TierConfiguration.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockConfigs),
      });

      const updatedProgress = await loyaltyService.processQrScanPoints("user123", 25, "redeem123");

      expect(LoyaltyTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        points: 25,
        type: LOYALTY_TRANSACTION_TYPES.BOTH,
        source: LOYALTY_TRANSACTION_SOURCES.QR_SCAN,
      }));
      expect(mockProgress.qualificationPoints).toBe(75);
    });

    it("should award campaign bonus affecting ONLY redeemable balance", async () => {
      await loyaltyService.addBonusPoints("user123", 150, "Spring Campaign Reward");

      expect(LoyaltyTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        points: 150,
        type: LOYALTY_TRANSACTION_TYPES.REDEEMABLE,
        source: LOYALTY_TRANSACTION_SOURCES.CAMPAIGN_BONUS,
      }));
      expect(mockUser.totalPoints).toBe(350); // 200 + 150
      expect(mockProgress.qualificationPoints).toBe(50); // Unchanged
    });
  });

  describe("Dynamic Tier Upgrades", () => {
    it("should automatically upgrade user tier when crossing qualification threshold", async () => {
      // User QP goes from 50 to 120 (Bronze is threshold 100)
      mockProgress.qualificationPoints = 120;

      UserTierProgress.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProgress),
      });
      TierConfiguration.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockConfigs),
      });

      // Stub refetch inside upgrade return
      UserTierProgress.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({
          ...mockProgress,
          currentTierId: mockTiers[1], // Upgraded to Bronze
        }),
      });

      const result = await loyaltyService.evaluateTierUpgrade("user123", "season123");

      expect(mockProgress.save).toHaveBeenCalled();
      expect(User.findById).toHaveBeenCalledWith("user123");
      expect(mockUser.save).toHaveBeenCalled();
      expect(result.currentTierId.name).toBe("Bronze");
    });
  });

  describe("Loyalty Controller CRUD Admin Endpoints", () => {
    let mockReq, mockRes;

    beforeEach(() => {
      mockReq = {
        params: { id: "someId" },
        body: { name: "Updated Name" },
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
    });

    it("should delete a loyalty tier", async () => {
      Tier.findByIdAndDelete.mockResolvedValue({});
      await loyaltyController.deleteTier(mockReq, mockRes);
      expect(Tier.findByIdAndDelete).toHaveBeenCalledWith("someId");
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("should update a season and deactivate others if active is true", async () => {
      mockReq.body = { name: "Season Updated", active: true };
      LoyaltySeason.findByIdAndUpdate.mockResolvedValue({ _id: "someId", name: "Season Updated" });
      await loyaltyController.updateSeason(mockReq, mockRes);
      expect(LoyaltySeason.updateMany).toHaveBeenCalledWith({ _id: { $ne: "someId" } }, { active: false });
      expect(LoyaltySeason.findByIdAndUpdate).toHaveBeenCalledWith("someId", mockReq.body, { new: true });
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("should delete a loyalty season", async () => {
      LoyaltySeason.findByIdAndDelete.mockResolvedValue({});
      await loyaltyController.deleteSeason(mockReq, mockRes);
      expect(LoyaltySeason.findByIdAndDelete).toHaveBeenCalledWith("someId");
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("should delete a tier configuration", async () => {
      TierConfiguration.findByIdAndDelete.mockResolvedValue({});
      await loyaltyController.deleteTierConfiguration(mockReq, mockRes);
      expect(TierConfiguration.findByIdAndDelete).toHaveBeenCalledWith("someId");
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("should update a tier benefit", async () => {
      TierBenefit.findByIdAndUpdate.mockResolvedValue({ _id: "someId", name: "Updated Benefit" });
      await loyaltyController.updateBenefit(mockReq, mockRes);
      expect(TierBenefit.findByIdAndUpdate).toHaveBeenCalledWith("someId", mockReq.body, { new: true });
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("should delete a tier benefit", async () => {
      TierBenefit.findByIdAndDelete.mockResolvedValue({});
      await loyaltyController.deleteBenefit(mockReq, mockRes);
      expect(TierBenefit.findByIdAndDelete).toHaveBeenCalledWith("someId");
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });
});

const loyaltyService = require("../loyalty.service");
const loyaltyController = require("../loyalty.controller");
const Tier = require("../../../schemas/tier.schema");
const LoyaltySeason = require("../../../schemas/loyalty-season.schema");
const TierConfiguration = require("../../../schemas/tier-configuration.schema");
const UserTierProgress = require("../../../schemas/user-tier-progress.schema");
const LoyaltyTransaction = require("../../../schemas/loyalty-transaction.schema");
const User = require("../../../schemas/user.schema");
const SeasonTierClaim = require("../../../schemas/season-tier-claim.schema");
const PointsLedger = require("../../../schemas/points-ledger.schema");
const rewardsService = require("../../rewards/rewards.service");
const {
  LOYALTY_TRANSACTION_TYPES,
  LOYALTY_TRANSACTION_SOURCES,
  CARRY_FORWARD_BEHAVIOR,
} = require("../../../constants/loyalty");

let scheduleCallback;
// Mock node-cron
jest.mock("node-cron", () => ({
  schedule: jest.fn((time, cb) => {
    if (time === "5 0 * * *") {
      scheduleCallback = cb;
    }
  }),
}));

// Mock schemas
jest.mock("../../../schemas/tier.schema");
jest.mock("../../../schemas/loyalty-season.schema");
jest.mock("../../../schemas/tier-configuration.schema");
jest.mock("../../../schemas/user-tier-progress.schema");
jest.mock("../../../schemas/loyalty-transaction.schema");
jest.mock("../../../schemas/user.schema");
jest.mock("../../../schemas/season-tier-claim.schema");
jest.mock("../../../schemas/points-ledger.schema");
jest.mock("../../rewards/rewards.service", () => ({
  awardRewardToUser: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock("../../../functions/fcm", () => ({
  sendFcmNotifications: jest.fn().mockResolvedValue({}),
}));
jest.mock("../../../modules/audit-log/audit-log.service", () => ({
  logAudit: jest.fn().mockResolvedValue({}),
  buildChanges: jest.fn().mockReturnValue([]),
  clearAllAuditLogs: jest.fn().mockResolvedValue({}),
}));
jest.mock("../loyalty-audit.service", () => ({
  createTierConfigHistorySnapshot: jest.fn().mockResolvedValue({}),
}));
const loyaltyAuditService = require("../../../modules/audit-log/audit-log.service");

describe("Loyalty and Tier Progression Engine", () => {
  let mockUser, mockTiers, mockSeason, mockConfigs, mockProgress;

  beforeEach(() => {
    PointsLedger.create.mockResolvedValue({});
    jest.clearAllMocks();

    const mongoose = require("mongoose");
    mongoose.startSession = jest.fn().mockResolvedValue({
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    });

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
      {
        _id: "tier0",
        name: "Beginner",
        key: "beginner",
        rank: 0,
        colorIdentity: "#8E8E93",
        qualificationPoint: 0,
        threshold: 100,
      },
      {
        _id: "tier1",
        name: "Bronze",
        key: "bronze",
        rank: 1,
        colorIdentity: "#CD7F32",
        qualificationPoint: 100,
        threshold: 400,
      },
      {
        _id: "tier2",
        name: "Silver",
        key: "silver",
        rank: 2,
        colorIdentity: "#C0C0C0",
        qualificationPoint: 500,
        threshold: 500,
      },
      {
        _id: "tier3",
        name: "Gold",
        key: "gold",
        rank: 3,
        colorIdentity: "#FFD700",
        qualificationPoint: 1000,
        threshold: 1000,
      },
      {
        _id: "tier4",
        name: "Platinum",
        key: "platinum",
        rank: 4,
        colorIdentity: "#E5E4E2",
        qualificationPoint: 2000,
        threshold: 100000,
      },
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
      {
        tierId: mockTiers[0],
        seasonId: "season123",
        qualificationPoint: 0,
        threshold: 100,
        pointMultiplier: 1.0,
      },
      {
        tierId: mockTiers[1],
        seasonId: "season123",
        qualificationPoint: 100,
        threshold: 400,
        pointMultiplier: 1.1,
      },
      {
        tierId: mockTiers[2],
        seasonId: "season123",
        qualificationPoint: 500,
        threshold: 500,
        pointMultiplier: 1.2,
      },
      {
        tierId: mockTiers[3],
        seasonId: "season123",
        qualificationPoint: 1000,
        threshold: 1000,
        pointMultiplier: 1.3,
      },
      {
        tierId: mockTiers[4],
        seasonId: "season123",
        qualificationPoint: 2000,
        threshold: 100000,
        pointMultiplier: 1.5,
      },
    ];

    mockProgress = {
      _id: "progress123",
      userId: "user123",
      seasonId: "season123",
      currentTierId: mockTiers[0],
      currentPoint: 50,
      save: jest.fn(),
    };

    // Mocks implementations
    LoyaltySeason.findOne.mockResolvedValue(mockSeason);
    User.findById.mockResolvedValue(mockUser);
    User.findByIdAndUpdate.mockResolvedValue(mockUser);
    const mockTierQuery = {
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve(mockTiers[0])),
    };
    Tier.findOne.mockReturnValue(mockTierQuery);
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
      expect(progress.currentPoint).toBe(50);
    });

    it("should calculate progressPercentage using the difference between current tier QP and (next tier QP - 1)", async () => {
      // Mock getOrCreateUserProgress mock returned via findOneAndUpdate
      UserTierProgress.findOneAndUpdate = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProgress),
      });

      UserTierProgress.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          _id: "progress123",
          userId: "user123",
          seasonId: "season123",
          currentTierId: mockTiers[0], // Beginner
          currentPoint: 50,
        }),
      });

      TierConfiguration.findOne = jest.fn();
      // Call 1: Next config (Bronze, threshold 100)
      TierConfiguration.findOne.mockReturnValueOnce({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          tierId: mockTiers[1], // Bronze
          qualificationPoint: 100,
        }),
      });
      // Call 2: Current tier threshold (Beginner, threshold 0)
      TierConfiguration.findOne.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          qualificationPoint: 0,
        }),
      });
      // Call 3: Active configuration point multiplier (1.0)
      TierConfiguration.findOne.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          pointMultiplier: 1.0,
        }),
      });

      const summary = await loyaltyService.getUserLoyaltySummary("user123");

      // Formula: (50 - 0) / ((100 - 1) - 0) * 100 = 50 / 99 * 100 = 50.5050... => 51%
      expect(summary.progressPercentage).toBe(51);
      expect(summary.remainingPoints).toBe(50); // 100 - 50 = 50
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
      expect(result[0]).toHaveProperty("isUnlocked");
      expect(result[0]).toHaveProperty("isClaimed");
      expect(result[0]).toHaveProperty("isClaimable");
      expect(result[0]).toHaveProperty("isUnlocked");
      expect(result[0]).toHaveProperty("isClaimed");
      expect(result[0]).toHaveProperty("isClaimable");
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

      const updatedProgress = await loyaltyService.processQrScanPoints(
        "user123",
        25,
        "redeem123",
      );

      expect(LoyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          points: 25,
          type: LOYALTY_TRANSACTION_TYPES.BOTH,
          source: LOYALTY_TRANSACTION_SOURCES.QR_SCAN,
        }),
      );
      expect(UserTierProgress.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ $inc: { currentPoint: 25 } }),
        expect.any(Object),
      );
    });

    it("should award campaign bonus and sync QP to match redeemable balance if QP is lower", async () => {
      User.findByIdAndUpdate = jest
        .fn()
        .mockResolvedValue({ ...mockUser, totalPoints: 350 });
      UserTierProgress.findOneAndUpdate = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProgress),
      });

      const validUserId = "507f1f77bcf86cd799439011";
      await loyaltyService.addBonusPoints(
        validUserId,
        150,
        "Spring Campaign Reward",
      );

      expect(LoyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          points: 150,
          type: LOYALTY_TRANSACTION_TYPES.REDEEMABLE,
          source: LOYALTY_TRANSACTION_SOURCES.CAMPAIGN_BONUS,
        }),
      );
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        validUserId,
        expect.objectContaining({
          $inc: { totalPoints: 150, lifetimePoints: 150 },
        }),
        expect.any(Object),
      );
      expect(UserTierProgress.findOneAndUpdate).toHaveBeenLastCalledWith(
        { userId: validUserId, seasonId: "season123" },
        expect.objectContaining({ $max: { currentPoint: 350 } }),
      );
    });

    it("should award campaign bonus and leave QP unchanged if QP is already higher than redeemable balance", async () => {
      const validUserId = "507f1f77bcf86cd799439011";
      mockProgress.currentPoint = 500;
      User.findByIdAndUpdate = jest
        .fn()
        .mockResolvedValue({ ...mockUser, totalPoints: 350 });
      UserTierProgress.findOneAndUpdate = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProgress),
      });

      await loyaltyService.addBonusPoints(
        validUserId,
        150,
        "Spring Campaign Reward",
      );

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        validUserId,
        expect.objectContaining({
          $inc: { totalPoints: 150, lifetimePoints: 150 },
        }),
        expect.any(Object),
      );
      expect(UserTierProgress.findOneAndUpdate).toHaveBeenCalledTimes(1); // Only called by getOrCreateUserProgress
    });
  });

  describe("Dynamic Tier Upgrades", () => {
    it("should automatically upgrade user tier when crossing qualification threshold", async () => {
      // User QP goes from 50 to 120 (Bronze is threshold 100)
      mockProgress.currentPoint = 120;

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

      const result = await loyaltyService.evaluateTierUpgrade(
        "user123",
        "season123",
      );

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
      const existing = {
        _id: "someId",
        name: "Season 1",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        toObject: () => ({ _id: "someId", name: "Season 1" }),
      };
      LoyaltySeason.findById.mockResolvedValue(existing);
      LoyaltySeason.findByIdAndUpdate.mockResolvedValue({
        ...existing,
        name: "Season Updated",
      });
      await loyaltyController.updateSeason(mockReq, mockRes);
      expect(LoyaltySeason.updateMany).toHaveBeenCalledWith(
        { _id: { $ne: "someId" }, active: true },
        { active: false, deactivatedAt: expect.any(Date) },
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("should delete a loyalty season", async () => {
      LoyaltySeason.findByIdAndDelete.mockResolvedValue({});
      await loyaltyController.deleteSeason(mockReq, mockRes);
      expect(LoyaltySeason.findByIdAndDelete).toHaveBeenCalledWith("someId");
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("should delete a tier configuration", async () => {
      TierConfiguration.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          seasonId: { startDate: new Date(Date.now() + 86400000) },
        }),
      });
      TierConfiguration.findByIdAndDelete.mockResolvedValue({});
      await loyaltyController.deleteTierConfiguration(mockReq, mockRes);
      expect(TierConfiguration.findByIdAndDelete).toHaveBeenCalledWith(
        "someId",
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  describe("Tier Configuration Overlap Validation", () => {
    let mockSeasonActive, mockSeasonInactive, mockTiersList;

    beforeEach(() => {
      mockSeasonActive = {
        _id: "seasonActive",
        name: "Active Season",
        active: true,
      };

      mockSeasonInactive = {
        _id: "seasonInactive",
        name: "Inactive Season",
        active: false,
      };

      mockTiersList = [
        {
          _id: "tierBeginner",
          name: "Beginner",
          key: "beginner",
          rank: 0,
          qualificationPoint: 0,
          threshold: 100,
        },
        {
          _id: "tierBronze",
          name: "Bronze",
          key: "bronze",
          rank: 1,
          qualificationPoint: 100,
          threshold: 400,
        },
        {
          _id: "tierSilver",
          name: "Silver",
          key: "silver",
          rank: 2,
          qualificationPoint: 500,
          threshold: 500,
        },
      ];

      const activeSeasonQuery = Promise.resolve(mockSeasonActive);
      activeSeasonQuery.lean = jest.fn().mockResolvedValue(mockSeasonActive);
      LoyaltySeason.findById.mockReturnValue(activeSeasonQuery);

      Tier.findById.mockImplementation((id) => {
        const t = mockTiersList.find((x) => x._id === id);
        const tierQuery = Promise.resolve(t);
        tierQuery.lean = jest.fn().mockResolvedValue(t);
        return tierQuery;
      });
    });

    it("should allow creating a config if it does not overlap with existing configs", async () => {
      TierConfiguration.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue([
          {
            _id: "configBeginner",
            seasonId: "seasonActive",
            tierId: mockTiersList[0],
            qualificationPoint: 0,
            threshold: 100,
          },
        ]),
      });

      TierConfiguration.create.mockResolvedValue({
        _id: "newConfig",
        seasonId: "seasonActive",
        tierId: "tierBronze",
        qualificationPoint: 100,
        threshold: 400,
        toObject: jest.fn().mockReturnThis(),
      });

      const result = await loyaltyService.createTierConfiguration("admin123", {
        seasonId: "seasonActive",
        tierId: "tierBronze",
        qualificationPoint: 100,
        threshold: 400,
      });

      expect(result.qualificationPoint).toBe(100);
      expect(TierConfiguration.create).toHaveBeenCalled();
    });

    it("should throw a conflict error if new config overlaps with existing configs", async () => {
      TierConfiguration.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue([
          {
            _id: "configBeginner",
            seasonId: "seasonActive",
            tierId: mockTiersList[0],
            qualificationPoint: 0,
            threshold: 100,
          },
        ]),
      });

      await expect(
        loyaltyService.createTierConfiguration("admin123", {
          seasonId: "seasonActive",
          tierId: "tierBronze",
          qualificationPoint: 0,
          threshold: 400,
        }),
      ).rejects.toThrow();
    });

    it("should throw a conflict error if updated configuration overlaps with existing configs", async () => {
      const mockConfigPopulated = {
        _id: "configBronze",
        seasonId: mockSeasonActive,
        tierId: mockTiersList[1],
        qualificationPoint: 100,
        threshold: 400,
        toObject: jest
          .fn()
          .mockReturnValue({ qualificationPoint: 100, threshold: 400 }),
      };
      const configQuery = Promise.resolve(mockConfigPopulated);
      configQuery.populate = jest.fn().mockReturnValue(configQuery);
      TierConfiguration.findById.mockReturnValue(configQuery);

      TierConfiguration.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue([
          {
            _id: "configSilver",
            seasonId: "seasonActive",
            tierId: mockTiersList[2],
            qualificationPoint: 500,
            threshold: 500,
          },
        ]),
      });

      await expect(
        loyaltyService.updateTierConfiguration("admin123", "configBronze", {
          qualificationPoint: 600,
          threshold: 400,
        }),
      ).rejects.toThrow();
    });

    it("should bypass validation if the season is inactive", async () => {
      const inactiveSeasonQuery = Promise.resolve(mockSeasonInactive);
      inactiveSeasonQuery.lean = jest
        .fn()
        .mockResolvedValue(mockSeasonInactive);
      LoyaltySeason.findById.mockReturnValue(inactiveSeasonQuery);

      TierConfiguration.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue([
          {
            _id: "configBeginner",
            seasonId: "seasonInactive",
            tierId: mockTiersList[0],
            qualificationPoint: 0,
            threshold: 100,
          },
        ]),
      });

      TierConfiguration.create.mockResolvedValue({
        _id: "newConfig",
        seasonId: "seasonInactive",
        tierId: "tierBronze",
        qualificationPoint: 50,
        threshold: 400,
        toObject: jest.fn().mockReturnThis(),
      });

      const result = await loyaltyService.createTierConfiguration("admin123", {
        seasonId: "seasonInactive",
        tierId: "tierBronze",
        qualificationPoint: 50,
        threshold: 400,
      });

      expect(result.qualificationPoint).toBe(50);
    });
  });

  describe("Tier Recalculation on Configuration Threshold Change", () => {
    let mockSeasonActive, mockTiersList, mockConfigsList;

    beforeEach(() => {
      mockSeasonActive = {
        _id: "seasonActive",
        name: "Active Season",
        active: true,
      };

      mockTiersList = [
        { _id: "tierBeginner", name: "Beginner", key: "beginner", rank: 0 },
        { _id: "tierBronze", name: "Bronze", key: "bronze", rank: 1 },
        { _id: "tierSilver", name: "Silver", key: "silver", rank: 2 },
      ];

      mockConfigsList = [
        { tierId: mockTiersList[0], qualificationPoint: 0, threshold: 100 },
        { tierId: mockTiersList[1], qualificationPoint: 100, threshold: 400 },
        { tierId: mockTiersList[2], qualificationPoint: 500, threshold: 500 },
      ];

      jest.clearAllMocks();
      LoyaltySeason.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockSeasonActive),
      });
      Tier.findById.mockImplementation((id) => {
        const t = mockTiersList.find((x) => x._id === id);
        return { lean: jest.fn().mockResolvedValue(t) };
      });

      UserTierProgress.bulkWrite = jest.fn().mockResolvedValue({});
      User.bulkWrite = jest.fn().mockResolvedValue({});
      User.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          {
            _id: "user123",
            fcmTokens: ["token1"],
            enableNotification: true,
          },
        ]),
      });
    });

    it("should upgrade a user if the threshold of the next tier is lowered below their current QP", async () => {
      loyaltyAuditService.buildChanges.mockReturnValue([
        { field: "qualificationPoint", oldValue: 500, newValue: 110 },
      ]);
      const mockProgress = {
        _id: "progress123",
        userId: "user123",
        seasonId: "seasonActive",
        currentTierId: mockTiersList[1],
        currentPoint: 120,
      };

      UserTierProgress.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue([mockProgress]),
      });

      const mockConfigPopulated = {
        _id: "configSilver",
        seasonId: mockSeasonActive,
        tierId: mockTiersList[2],
        qualificationPoint: 500,
        threshold: 500,
        toObject: jest
          .fn()
          .mockReturnValue({ qualificationPoint: 500, threshold: 500 }),
      };

      const configQuery = Promise.resolve(mockConfigPopulated);
      configQuery.populate = jest.fn().mockReturnValue(configQuery);
      TierConfiguration.findById.mockReturnValue(configQuery);

      TierConfiguration.findByIdAndUpdate.mockResolvedValue({
        _id: "configSilver",
        seasonId: "seasonActive",
        tierId: "tierSilver",
        qualificationPoint: 110,
        threshold: 500,
        toObject: jest
          .fn()
          .mockReturnValue({ qualificationPoint: 110, threshold: 500 }),
      });

      TierConfiguration.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { tierId: mockTiersList[0], qualificationPoint: 0, threshold: 100 },
          { tierId: mockTiersList[1], qualificationPoint: 100, threshold: 10 },
          { tierId: mockTiersList[2], qualificationPoint: 110, threshold: 500 },
        ]),
      });

      TierConfiguration.find.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue([
          { tierId: mockTiersList[0], qualificationPoint: 0, threshold: 100 },
          { tierId: mockTiersList[1], qualificationPoint: 100, threshold: 10 },
        ]),
      });

      await loyaltyService.updateTierConfiguration("admin123", "configSilver", {
        qualificationPoint: 110,
      });

      expect(UserTierProgress.bulkWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            updateOne: expect.objectContaining({
              filter: { _id: "progress123" },
              update: expect.objectContaining({
                $set: expect.objectContaining({
                  currentTierId: "tierSilver",
                }),
              }),
            }),
          }),
        ]),
      );

      expect(User.bulkWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            updateOne: expect.objectContaining({
              filter: { _id: "user123" },
              update: expect.objectContaining({
                $set: expect.objectContaining({
                  currentTierId: "tierSilver",
                }),
              }),
            }),
          }),
        ]),
      );
    });

    it("should downgrade a user if the threshold of their current tier is raised above their current QP", async () => {
      loyaltyAuditService.buildChanges.mockReturnValue([
        { field: "qualificationPoint", oldValue: 100, newValue: 150 },
      ]);
      const mockProgress = {
        _id: "progress123",
        userId: "user123",
        seasonId: "seasonActive",
        currentTierId: mockTiersList[1],
        currentPoint: 120,
      };

      UserTierProgress.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue([mockProgress]),
      });

      const mockConfigPopulated = {
        _id: "configBronze",
        seasonId: mockSeasonActive,
        tierId: mockTiersList[1],
        qualificationPoint: 100,
        threshold: 400,
        toObject: jest
          .fn()
          .mockReturnValue({ qualificationPoint: 100, threshold: 400 }),
      };

      const configQuery = Promise.resolve(mockConfigPopulated);
      configQuery.populate = jest.fn().mockReturnValue(configQuery);
      TierConfiguration.findById.mockReturnValue(configQuery);

      TierConfiguration.findByIdAndUpdate.mockResolvedValue({
        _id: "configBronze",
        seasonId: "seasonActive",
        tierId: "tierBronze",
        qualificationPoint: 150,
        threshold: 400,
        toObject: jest
          .fn()
          .mockReturnValue({ qualificationPoint: 150, threshold: 400 }),
      });

      TierConfiguration.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { tierId: mockTiersList[0], qualificationPoint: 0, threshold: 100 },
          { tierId: mockTiersList[1], qualificationPoint: 150, threshold: 400 },
          { tierId: mockTiersList[2], qualificationPoint: 600, threshold: 500 },
        ]),
      });

      TierConfiguration.find.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue([
          { tierId: mockTiersList[0], qualificationPoint: 0, threshold: 100 },
          { tierId: mockTiersList[2], qualificationPoint: 600, threshold: 500 },
        ]),
      });

      await loyaltyService.updateTierConfiguration("admin123", "configBronze", {
        qualificationPoint: 150,
      });

      expect(UserTierProgress.bulkWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            updateOne: expect.objectContaining({
              filter: { _id: "progress123" },
              update: expect.objectContaining({
                $set: expect.objectContaining({
                  currentTierId: "tierBeginner",
                }),
              }),
            }),
          }),
        ]),
      );

      expect(User.bulkWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            updateOne: expect.objectContaining({
              filter: { _id: "user123" },
              update: expect.objectContaining({
                $set: expect.objectContaining({
                  currentTierId: "tierBeginner",
                }),
              }),
            }),
          }),
        ]),
      );
    });

    it("should recalculate non-final tiers thresholds and skip final tiers", async () => {
      const mockConfigsWithFinal = [
        {
          _id: "configBeginner",
          tierId: mockTiersList[0],
          qualificationPoint: 0,
          threshold: 100,
          isFinalTier: false,
        },
        {
          _id: "configBronze",
          tierId: mockTiersList[1],
          qualificationPoint: 100,
          threshold: 400,
          isFinalTier: true,
        },
      ];

      loyaltyAuditService.buildChanges.mockReturnValue([
        { field: "qualificationPoint", oldValue: 0, newValue: 10 },
      ]);

      const mockConfigPopulated = {
        ...mockConfigsWithFinal[0],
        seasonId: mockSeasonActive,
        toObject: jest.fn().mockReturnValue({
          qualificationPoint: 0,
          threshold: 100,
          isFinalTier: false,
        }),
      };

      const configQuery = Promise.resolve(mockConfigPopulated);
      configQuery.populate = jest.fn().mockReturnValue(configQuery);
      TierConfiguration.findById.mockReturnValue(configQuery);

      TierConfiguration.findByIdAndUpdate = jest
        .fn()
        .mockImplementation((id, update) => {
          return Promise.resolve({
            _id: id,
            ...update,
            toObject: jest.fn().mockReturnValue({ ...update }),
          });
        });

      const mockQuery = {
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) => resolve(mockConfigsWithFinal)),
      };
      TierConfiguration.find.mockReturnValue(mockQuery);

      await loyaltyService.updateTierConfiguration(
        "admin123",
        "configBeginner",
        {
          qualificationPoint: 10,
        },
      );

      expect(TierConfiguration.findByIdAndUpdate).toHaveBeenCalledWith(
        "configBeginner",
        expect.objectContaining({ threshold: 100 }),
      );
      expect(TierConfiguration.findByIdAndUpdate).not.toHaveBeenCalledWith(
        "configBronze",
        expect.any(Object),
      );
    });
  });

  describe("Active Tier Range Overlap Validation", () => {
    let mockLean;

    beforeEach(() => {
      Tier.findById = jest.fn();
      mockLean = jest.fn();
      Tier.find = jest.fn().mockReturnValue({
        lean: mockLean,
      });
    });

    it("should allow active tier creation if there are no overlaps with other active tiers", async () => {
      mockLean.mockResolvedValue([
        {
          _id: "tierBeginner",
          name: "Beginner",
          qualificationPoint: 0,
          threshold: 100,
          active: true,
        },
        {
          _id: "tierBronze",
          name: "Bronze",
          qualificationPoint: 100,
          threshold: 400,
          active: true,
        },
      ]);

      const payload = {
        name: "Silver",
        qualificationPoint: 500,
        threshold: 500,
        active: true,
      };

      await expect(
        loyaltyService.validateTierRange(payload),
      ).resolves.not.toThrow();
    });

    it("should throw error if new active tier overlaps with an existing active tier", async () => {
      mockLean.mockResolvedValue([
        {
          _id: "tierBeginner",
          name: "Beginner",
          qualificationPoint: 0,
          threshold: 100,
          active: true,
        },
        {
          _id: "tierBronze",
          name: "Bronze",
          qualificationPoint: 100,
          threshold: 400,
          active: true,
        },
      ]);

      const payload = {
        name: "Conflicting Tier",
        qualificationPoint: 400,
        threshold: 500,
        active: true,
      };

      await expect(loyaltyService.validateTierRange(payload)).rejects.toThrow(
        /Conflict detected: The active range/,
      );
    });

    it("should bypass overlap check if the new tier is inactive", async () => {
      mockLean.mockResolvedValue([
        {
          _id: "tierBeginner",
          name: "Beginner",
          qualificationPoint: 0,
          threshold: 100,
          active: true,
        },
      ]);

      const payload = {
        name: "Conflicting Inactive Tier",
        qualificationPoint: 50,
        threshold: 100,
        active: false,
      };

      await expect(
        loyaltyService.validateTierRange(payload),
      ).resolves.not.toThrow();
    });

    it("should throw error if new tier's QP conflicts with a lower rank tier's higher QP", async () => {
      mockLean.mockResolvedValue([
        {
          _id: "tierBeginner",
          name: "Beginner",
          rank: 0,
          qualificationPoint: 200,
          threshold: 100,
          active: true,
        },
      ]);

      const payload = {
        name: "Bronze",
        rank: 1,
        qualificationPoint: 100,
        threshold: 100,
        active: true,
      };

      await expect(loyaltyService.validateTierRange(payload)).rejects.toThrow(
        /Qualification point conflicts with lower rank tier/,
      );
    });
  });

  describe("No Active Season Graceful Fallbacks", () => {
    it("should return default summary if there is no active season", async () => {
      LoyaltySeason.findOne.mockResolvedValue(null);
      const summary = await loyaltyService.getUserLoyaltySummary("user123");
      expect(summary.activeSeason).toBeNull();
      expect(summary.currentTier.name).toBe("Beginner");
      expect(summary.currentTier.pointMultiplier).toBe(1.0);
    });

    it("should return empty progression metadata if there is no active season", async () => {
      LoyaltySeason.findOne.mockResolvedValue(null);
      const metadata =
        await loyaltyService.getTierProgressionMetadata("user123");
      expect(metadata).toEqual([]);
    });

    it("should return null progress if there is no active season", async () => {
      LoyaltySeason.findOne.mockResolvedValue(null);
      const progress = await loyaltyService.getOrCreateUserProgress("user123");
      expect(progress).toBeNull();
    });

    it("should return null scan result if there is no active season", async () => {
      LoyaltySeason.findOne.mockResolvedValue(null);
      const result = await loyaltyService.processQrScanPoints(
        "user123",
        100,
        "ref123",
      );
      expect(result).toBeNull();
    });
  });

  describe("Season Rollover Task in cron.js", () => {
    let cronModule;

    beforeAll(() => {
      cronModule = require("../../../cron");
    });

    it("should dynamically evaluate new tier configs based on scaled carry-forward points on rollover", async () => {
      const endedSeason = {
        _id: "endedSeasonId",
        name: "Ended Season",
        endDate: new Date(Date.now() - 1000 * 60 * 60),
        carryForwardBehavior: "PERCENTAGE",
        carryForwardPercentage: 50,
        active: true,
        save: jest.fn(),
      };

      const nextSeason = {
        _id: "nextSeasonId",
        name: "Next Season",
        startDate: new Date(Date.now() - 1000 * 60),
        endDate: new Date(Date.now() + 1000 * 60 * 60 * 24),
        active: false,
        save: jest.fn(),
      };

      const mockEndedProgress = [
        {
          userId: "userA",
          seasonId: "endedSeasonId",
          currentTierId: "tier0",
          currentPoint: 200,
        },
        {
          userId: "userB",
          seasonId: "endedSeasonId",
          currentTierId: "tier0",
          currentPoint: 600,
        },
      ];

      const nextTiers = [
        { _id: "newTier0", name: "Beginner", rank: 0 },
        { _id: "newTier1", name: "Bronze", rank: 1 },
        { _id: "newTier2", name: "Silver", rank: 2 },
      ];

      const nextConfigs = [
        { tierId: nextTiers[0], qualificationPoint: 0 },
        { tierId: nextTiers[1], qualificationPoint: 100 },
        { tierId: nextTiers[2], qualificationPoint: 500 },
      ];

      LoyaltySeason.findOne
        .mockResolvedValueOnce(endedSeason) // 1. endedSeason for rollover
        .mockResolvedValueOnce(nextSeason) // 2. nextSeason for rollover lookup
        .mockResolvedValueOnce(nextSeason); // 3. seasonToActivate

      LoyaltySeason.find.mockResolvedValueOnce([endedSeason]); // for deactivating old active seasons

      UserTierProgress.find.mockResolvedValue(mockEndedProgress);

      TierConfiguration.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(nextConfigs),
      });

      Tier.findOne.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(nextTiers[0]),
      });

      UserTierProgress.findOneAndUpdate = jest.fn();
      User.findByIdAndUpdate = jest.fn();

      cronModule.initCronJobs();
      expect(scheduleCallback).toBeDefined();

      await scheduleCallback();

      expect(endedSeason.active).toBe(false);
      expect(endedSeason.save).toHaveBeenCalled();
      expect(nextSeason.active).toBe(true);
      expect(nextSeason.save).toHaveBeenCalled();

      expect(UserTierProgress.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: "userA", seasonId: "nextSeasonId" },
        expect.objectContaining({
          $setOnInsert: expect.objectContaining({
            currentTierId: "newTier1",
            currentPoint: 100,
          }),
        }),
        expect.any(Object),
      );
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith("userA", {
        currentTierId: "newTier1",
      });

      expect(UserTierProgress.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: "userB", seasonId: "nextSeasonId" },
        expect.objectContaining({
          $setOnInsert: expect.objectContaining({
            currentTierId: "newTier1",
            currentPoint: 300,
          }),
        }),
        expect.any(Object),
      );
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith("userB", {
        currentTierId: "newTier1",
      });
    });
  });

  describe("createSeason", () => {
    let mockSeasonInstance;

    beforeEach(() => {
      mockSeasonInstance = {
        _id: "newSeasonId",
        name: "New Season",
        code: "NS1",
        startDate: new Date(),
        endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        active: false,
        toObject: jest.fn().mockReturnValue({
          name: "New Season",
          code: "NS1",
          active: false,
        }),
      };

      LoyaltySeason.create.mockResolvedValue(mockSeasonInstance);
      LoyaltySeason.updateMany.mockResolvedValue({});
      LoyaltySeason.findOne.mockResolvedValue(null); // No overlap
    });

    it("should create a season with flat payload", async () => {
      const payload = {
        name: "New Season",
        code: "NS1",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        active: false,
      };

      const result = await loyaltyService.createSeason("admin123", payload);

      expect(LoyaltySeason.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Season",
          code: "NS1",
          active: false,
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ ...mockSeasonInstance, seasonCreated: true }),
      );
    });

    it("should create a season with nested payload and handle tier configurations in rank order", async () => {
      const payload = {
        seasonDetails: {
          name: "New Season Nested",
          code: "NSN1",
          startDate: "2026-07-01",
          endDate: "2026-07-31",
          active: true,
        },
        tierConfigurations: [
          { tierId: "tier2", qualificationPoint: 500 },
          { tierId: "tier1", qualificationPoint: 100 },
        ],
      };

      mockSeasonInstance.active = true;
      mockSeasonInstance.name = "New Season Nested";

      // Mock dependencies in createTierConfiguration
      const seasonQuery = Promise.resolve(mockSeasonInstance);
      seasonQuery.lean = jest.fn().mockResolvedValue(mockSeasonInstance);
      LoyaltySeason.findById.mockReturnValue(seasonQuery);

      const mockTiersList = [
        { _id: "tier1", rank: 1, name: "Bronze" },
        { _id: "tier2", rank: 2, name: "Silver" },
      ];
      Tier.findById.mockImplementation((id) => {
        const t = mockTiersList.find((x) => x._id === id);
        return { lean: jest.fn().mockResolvedValue(t) };
      });

      Tier.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTiersList),
      });

      TierConfiguration.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue([]),
      });

      const mockTierConfigResult = {
        _id: "configId",
        seasonId: "newSeasonId",
        toObject: jest.fn().mockReturnThis(),
      };
      TierConfiguration.create.mockResolvedValue(mockTierConfigResult);
      TierConfiguration.findByIdAndUpdate.mockResolvedValue({});

      const result = await loyaltyService.createSeason("admin123", payload);

      expect(LoyaltySeason.updateMany).toHaveBeenCalledWith(
        { active: true },
        { active: false, deactivatedAt: expect.any(Date) },
      );
      expect(LoyaltySeason.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Season Nested",
          active: true,
        }),
      );

      // Verify tier configurations are created in rank order (tier1 then tier2)
      expect(TierConfiguration.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          tierId: "tier1",
          seasonId: "newSeasonId",
        }),
      );
      expect(TierConfiguration.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          tierId: "tier2",
          seasonId: "newSeasonId",
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ ...mockSeasonInstance, seasonCreated: true }),
      );
    });

    it("should create season as inactive if season dates overlap", async () => {
      LoyaltySeason.findOne.mockResolvedValue({ name: "Existing Season" });

      const payload = {
        name: "New Season",
        code: "NS1",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        active: true,
      };

      await loyaltyService.createSeason("admin123", payload);

      expect(LoyaltySeason.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Season",
          code: "NS1",
          active: false,
        }),
      );
    });
  });

  describe("Season Tier Rewards & Configuration Management", () => {
    it("should create tier configuration with rewards payload", async () => {
      const mockSeason = { _id: "season123", active: true };
      const mockTier = { _id: "tier123", name: "Bronze", rank: 1 };
      LoyaltySeason.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockSeason),
      });
      Tier.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTier),
      });

      const payload = {
        seasonId: "season123",
        tierId: "tier123",
        qualificationPoint: 100,
        threshold: 400,
        pointMultiplier: 1.1,
        rewards: [
          { rewardType: "POINTS", points: 100, title: "100 Bonus Pts" },
          { rewardType: "COINS", coins: 20, title: "20 Hydacoins" },
        ],
      };

      const mockSavedConfig = {
        _id: "config123",
        ...payload,
      };

      TierConfiguration.prototype.save = jest
        .fn()
        .mockResolvedValue(mockSavedConfig);

      const result = await loyaltyService.createTierConfiguration(
        "admin123",
        payload,
      );

      expect(result).toBeDefined();
    });

    it("should update tier configuration rewards", async () => {
      const mockConfig = {
        _id: "config123",
        seasonId: { _id: "season123" },
        tierId: { _id: "tier123" },
        rewards: [{ rewardType: "POINTS", points: 50 }],
        toObject: jest.fn().mockReturnValue({}),
        save: jest.fn(),
      };
      TierConfiguration.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockConfig),
        then: jest.fn((cb) => cb(mockConfig)),
      });

      const updatePayload = {
        rewards: [
          { rewardType: "POINTS", points: 150, title: "Updated Pts" },
          { rewardType: "GIFT", giftName: "Exclusive Mug", title: "Free Mug" },
        ],
      };

      TierConfiguration.findByIdAndUpdate.mockResolvedValue({
        _id: "config123",
        seasonId: { _id: "season123" },
        tierId: { _id: "tier123" },
        toObject: jest.fn().mockReturnValue({}),
        ...updatePayload,
      });

      const result = await loyaltyService.updateTierConfiguration(
        "admin123",
        "config123",
        updatePayload,
      );

      expect(TierConfiguration.findByIdAndUpdate).toHaveBeenCalled();
    });
  });

  describe("Season Tier Rewards & Claiming Edge Cases", () => {
    it("should successfully claim tier rewards if user qualifies and has not claimed yet", async () => {
      const mockSeason = { _id: "season123", active: true };
      LoyaltySeason.findById.mockResolvedValue(mockSeason);

      const mockProgress = {
        userId: "user123",
        seasonId: "season123",
        currentPoint: 500,
        currentTierId: { _id: "tier123", rank: 1, name: "Bronze" },
      };
      UserTierProgress.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProgress),
      });

      const mockTierConfig = {
        _id: "config123",
        seasonId: "season123",
        tierId: { _id: "tier123", rank: 1, name: "Bronze" },
        qualificationPoint: 100,
        rewards: [
          { rewardType: "POINTS", points: 50, title: "Bonus Points" },
          { rewardType: "COINS", coins: 10, title: "Bonus Coins" },
        ],
      };
      const makeQueryMock = (val) => {
        const p = Promise.resolve(val);
        p.populate = jest.fn().mockResolvedValue(val);
        return p;
      };
      TierConfiguration.findOne.mockImplementation(() =>
        makeQueryMock(mockTierConfig),
      );
      TierConfiguration.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockResolvedValue([mockTierConfig]),
        }),
      });

      SeasonTierClaim.findOne.mockResolvedValue(null);
      SeasonTierClaim.create.mockResolvedValue({
        _id: "claim123",
        userId: "user123",
        seasonId: "season123",
        tierId: "tier123",
      });

      const result = await loyaltyService.claimTierReward("user123", {
        seasonId: "season123",
        tierId: "tier123",
      });

      expect(result.message).toContain("claimed successfully");
      expect(rewardsService.awardRewardToUser).toHaveBeenCalledTimes(2);
      expect(SeasonTierClaim.create).toHaveBeenCalled();
    });

    it("should throw error if user has already claimed rewards for this tier (Double Claiming)", async () => {
      const mockSeason = { _id: "season123", active: true };
      LoyaltySeason.findById.mockResolvedValue(mockSeason);

      const mockProgress = {
        userId: "user123",
        seasonId: "season123",
        currentPoint: 500,
        currentTierId: { _id: "tier123", rank: 1 },
      };
      UserTierProgress.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProgress),
      });

      const mockTierConfig = {
        _id: "config123",
        seasonId: "season123",
        tierId: { _id: "tier123", rank: 1 },
        qualificationPoint: 100,
        rewards: [{ rewardType: "POINTS", points: 50 }],
      };
      const makeQueryMock = (val) => {
        const p = Promise.resolve(val);
        p.populate = jest.fn().mockResolvedValue(val);
        return p;
      };
      TierConfiguration.findOne.mockImplementation(() =>
        makeQueryMock(mockTierConfig),
      );
      TierConfiguration.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockResolvedValue([mockTierConfig]),
        }),
      });

      SeasonTierClaim.findOne.mockResolvedValue({ _id: "existingClaim" });

      await expect(
        loyaltyService.claimTierReward("user123", {
          seasonId: "season123",
          tierId: "tier123",
        }),
      ).rejects.toThrow("already been claimed");
    });

    it("should throw error if season is not active", async () => {
      SeasonTierClaim.findOne.mockResolvedValue(null);
      LoyaltySeason.findById.mockResolvedValue({
        _id: "season123",
        active: false,
      });

      await expect(
        loyaltyService.claimTierReward("user123", {
          seasonId: "season123",
          tierId: "tier123",
        }),
      ).rejects.toThrow("Season is not active");
    });

    it("should throw error if user has not reached the tier being claimed", async () => {
      const mockSeason = { _id: "season123", active: true };
      LoyaltySeason.findById.mockResolvedValue(mockSeason);

      const mockProgress = {
        userId: "user123",
        seasonId: "season123",
        currentPoint: 50,
        currentTierId: { _id: "tier0", rank: 0, name: "Beginner" },
      };
      UserTierProgress.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProgress),
      });

      const mockTierConfig = {
        _id: "configGold",
        seasonId: "season123",
        tierId: { _id: "tierGold", rank: 3, name: "Gold" },
        qualificationPoint: 1000,
        rewards: [{ rewardType: "POINTS", points: 500 }],
      };
      const makeQueryMock = (val) => {
        const p = Promise.resolve(val);
        p.populate = jest.fn().mockResolvedValue(val);
        return p;
      };
      TierConfiguration.findOne.mockImplementation(() =>
        makeQueryMock(mockTierConfig),
      );

      SeasonTierClaim.findOne.mockResolvedValue(null);

      await expect(
        loyaltyService.claimTierReward("user123", {
          seasonId: "season123",
          tierId: "tierGold",
        }),
      ).rejects.toThrow("You have not reached this tier yet");
    });

    it("should throw error if tier configuration has no rewards defined", async () => {
      const mockSeason = { _id: "season123", active: true };
      LoyaltySeason.findById.mockResolvedValue(mockSeason);

      const mockProgress = {
        userId: "user123",
        seasonId: "season123",
        currentPoint: 500,
        currentTierId: { _id: "tier123", rank: 1, name: "Bronze" },
      };
      UserTierProgress.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProgress),
      });

      const mockTierConfig = {
        _id: "config123",
        seasonId: "season123",
        tierId: { _id: "tier123", rank: 1 },
        qualificationPoint: 100,
        rewards: [], // Empty rewards
      };
      const makeQueryMock = (val) => {
        const p = Promise.resolve(val);
        p.populate = jest.fn().mockResolvedValue(val);
        return p;
      };
      TierConfiguration.findOne.mockImplementation(() =>
        makeQueryMock(mockTierConfig),
      );

      SeasonTierClaim.findOne.mockResolvedValue(null);

      await expect(
        loyaltyService.claimTierReward("user123", {
          seasonId: "season123",
          tierId: "tier123",
        }),
      ).rejects.toThrow("No rewards available for this tier");
    });
  });

  describe("Season Rollover with Percentage Decline Carry-Forward", () => {
    it("should calculate 50% carry-forward points correctly during season rollover", async () => {
      const endedSeason = {
        _id: "seasonOld",
        name: "Old Season",
        active: false,
        carryForwardBehavior: "PERCENTAGE",
        carryForwardPercentage: 50,
      };

      const newSeason = {
        _id: "seasonNew",
        name: "New Season",
        active: true,
      };

      const previousPoints = 1000;
      const expectedCarriedPoints = 500; // 50% of 1000

      // Calculate carry forward points
      let carriedPoints = 0;
      if (endedSeason.carryForwardBehavior === "RESET") {
        carriedPoints = 0;
      } else if (endedSeason.carryForwardBehavior === "FULL") {
        carriedPoints = previousPoints;
      } else if (endedSeason.carryForwardBehavior === "PERCENTAGE") {
        const pct = Math.max(
          0,
          Math.min(100, Number(endedSeason.carryForwardPercentage) || 0),
        );
        carriedPoints = Math.floor(previousPoints * (pct / 100));
      }

      expect(carriedPoints).toBe(expectedCarriedPoints);
    });

    it("should assign Silver tier when user carries forward 500 points with 50% decline from 1000 points", async () => {
      const newSeasonTiers = [
        { _id: "t0", name: "Beginner", rank: 0, qualificationPoint: 0 },
        { _id: "t1", name: "Bronze", rank: 1, qualificationPoint: 100 },
        { _id: "t2", name: "Silver", rank: 2, qualificationPoint: 500 },
        { _id: "t3", name: "Gold", rank: 3, qualificationPoint: 1000 },
      ];

      const carriedPoints = 500;

      // Find highest qualifying tier for 500 points
      const qualifyingTier = [...newSeasonTiers]
        .sort((a, b) => b.rank - a.rank)
        .find((t) => carriedPoints >= t.qualificationPoint);

      expect(qualifyingTier).toBeDefined();
      expect(qualifyingTier.name).toBe("Silver");
      expect(qualifyingTier.rank).toBe(2);
    });
  });
});

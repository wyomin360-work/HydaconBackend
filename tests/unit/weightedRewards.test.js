const { createRedeem, claimGift } = require("../../src/modules/redeems/redeems.service");
const User = require("../../src/schemas/user.schema");
const Role = require("../../src/schemas/role.schema");
const Product = require("../../src/schemas/product.schema");
const Reward = require("../../src/schemas/reward.schema");
const Redeem = require("../../src/schemas/redeem.schema");

// Mocking the schemas and services
jest.mock("../../src/schemas/user.schema");
jest.mock("../../src/schemas/role.schema");
jest.mock("../../src/schemas/product.schema");
jest.mock("../../src/schemas/reward.schema");
jest.mock("../../src/schemas/redeem.schema");
jest.mock("../../src/schemas/gift.schema");
jest.mock("../../src/schemas/gift-redemption.schema");
jest.mock("../../src/schemas/app-config.schema");
jest.mock("../../src/schemas/tier-configuration.schema");
jest.mock("../../src/schemas/scratch-card-rule.schema");
jest.mock("../../src/schemas/contest-entry.schema", () => ({
  ContestEntry: {
    findOneAndUpdate: jest.fn().mockResolvedValue(true),
  },
}));
jest.mock("../../src/schemas/contest.schema", () => ({
  Contest: {
    find: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    }),
    updateMany: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(true),
    }),
  },
  CONTEST_STATUS: {
    UPCOMING: "upcoming",
    ACTIVE: "active",
    COMPLETED: "completed",
  },
}));
jest.mock("mongoose", () => {
  const actualMongoose = jest.requireActual("mongoose");
  return {
    ...actualMongoose,
    startSession: jest.fn().mockResolvedValue({
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
      withTransaction: jest.fn().mockImplementation(async (callback) => {
        await callback();
      }),
    }),
  };
});
jest.mock("../../src/functions/fcm", () => ({
  sendFcmNotifications: jest.fn(),
}));
jest.mock("../../src/modules/loyalty/loyalty.service", () => ({
  getOrCreateUserProgress: jest.fn().mockResolvedValue({
    seasonId: "season123",
    currentTierId: { _id: "tier123" },
  }),
  processQrScanPoints: jest.fn().mockResolvedValue(true),
  resolveActiveSeason: jest.fn().mockResolvedValue({ _id: "season123" }),
  addBonusPoints: jest.fn().mockResolvedValue({ message: "Bonus points successfully added", points: 50 }),
}));

describe("Weighted Rewards Calculation", () => {
  let mockUser, mockRole, mockProduct, mockReward;

  beforeEach(() => {
    jest.clearAllMocks();

    const ScratchCardRule = require("../../src/schemas/scratch-card-rule.schema");
    ScratchCardRule.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });

    const TierConfiguration = require("../../src/schemas/tier-configuration.schema");
    TierConfiguration.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ pointMultiplier: 1.0 }),
    });

    const AppConfig = require("../../src/schemas/app-config.schema");
    AppConfig.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        scratchCardSettings: {
          enabled: true,
          probability: 100,
          minBonusPoints: 50,
          maxBonusPoints: 50,
        },
      }),
    });

    mockRole = {
      _id: "role123",
      name: "Mason",
      pointMultiplier: 10,
    };

    mockUser = {
      _id: "user123",
      totalPoints: 0,
      save: jest.fn(),
      roleId: "role123",
      fcmTokens: [],
      kycStatus: "APPROVED",
    };

    mockProduct = {
      _id: "prod123",
      name: "Adhesive 20kg",
      rewardPoints: 5,
    };

    mockReward = {
      _id: "reward123",
      uidCode: "ABC-123",
      point: 5,
      active: true,
      expiresAt: new Date(Date.now() + 100000),
      isRedeemed: false,
      save: jest.fn(),
    };

    // Default implementations
    User.findById.mockReturnValue({
      populate: jest.fn().mockImplementation(() => Promise.resolve(mockUser)),
    });
    User.findByIdAndUpdate = jest.fn().mockResolvedValue(mockUser);
    Product.findById.mockResolvedValue(mockProduct);
    Reward.findOne.mockResolvedValue(mockReward);
    Redeem.create.mockImplementation((data) => Promise.resolve(data));
  });

  it("should award 50 points to a Mason (5 points * 10 multiplier)", async () => {
    // Override user to have the Mason role populated
    mockUser.roleId = mockRole;

    const redeemData = {
      userId: "user123",
      productId: "prod123",
      rewardId: "reward123",
      rewardUidCode: "ABC-123",
      location: { lat: 0, lng: 0 },
    };

    const response = await createRedeem(redeemData);

    expect(response.data.pointsRewarded).toBe(50);
    expect(mockUser.totalPoints).toBe(100);
    // Scratch card response fields
    expect(response.data.redeemSuccessful).toBe(true);
    expect(response.data.showScratchCard).toBe(true);
    expect(typeof response.data.cardBg).toBe("string");
    expect(response.data.productName).toBe("Adhesive 20kg");

    const loyaltyService = require("../../src/modules/loyalty/loyalty.service");
    expect(loyaltyService.addBonusPoints).toHaveBeenCalledWith(
      "user123",
      50,
      expect.stringContaining("Scratch card bonus points"),
      undefined, // in mock Redeem.create doesn't return real ID or it's mock
      expect.objectContaining({
        skipQpSync: true,
        skipLifetimePoints: true,
        source: "SCRATCH_CARD_BONUS"
      })
    );
  });

  it("should award 10 points to a Retailer (5 points * 2 multiplier)", async () => {
    mockRole.pointMultiplier = 2;
    mockUser.roleId = mockRole;

    const redeemData = {
      userId: "user123",
      productId: "prod123",
      rewardId: "reward123",
      rewardUidCode: "ABC-123",
      location: { lat: 0, lng: 0 },
    };

    const response = await createRedeem(redeemData);

    expect(response.data.pointsRewarded).toBe(10);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "user123",
      expect.objectContaining({
        $inc: expect.objectContaining({ totalPoints: 10, lifetimePoints: 10 }),
      }),
    );
  });

  it("should award base 5 points if user has no role multiplier", async () => {
    mockUser.roleId = null;

    const redeemData = {
      userId: "user123",
      productId: "prod123",
      rewardId: "reward123",
      rewardUidCode: "ABC-123",
      location: { lat: 0, lng: 0 },
    };

    const response = await createRedeem(redeemData);

    expect(response.data.pointsRewarded).toBe(5);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "user123",
      expect.objectContaining({
        $inc: expect.objectContaining({ totalPoints: 5, lifetimePoints: 5 }),
      }),
    );
  });

  it("should award 0 bonus points if min and max bonus points are 0 in AppConfig", async () => {
    const AppConfig = require("../../src/schemas/app-config.schema");
    AppConfig.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        scratchCardSettings: {
          enabled: true,
          probability: 100,
          minBonusPoints: 0,
          maxBonusPoints: 0,
        },
      }),
    });

    mockUser.roleId = null;

    const redeemData = {
      userId: "user123",
      productId: "prod123",
      rewardId: "reward123",
      rewardUidCode: "ABC-123",
      location: { lat: 0, lng: 0 },
    };

    const response = await createRedeem(redeemData);

    expect(response.data.pointsRewarded).toBe(5);
    expect(response.data.bonusPoints).toBe(0);
    expect(response.data.totalPointsAwarded).toBe(5);
    expect(response.data.showScratchCard).toBe(true);

    const loyaltyService = require("../../src/modules/loyalty/loyalty.service");
    expect(loyaltyService.addBonusPoints).not.toHaveBeenCalled();
  });

  it("should award a physical gift if rewardType is GIFT", async () => {
    const Gift = require("../../src/schemas/gift.schema");
    Gift.exists.mockResolvedValue(true);
    Gift.countDocuments.mockResolvedValue(1);
    Gift.findOne.mockReturnValue({
      skip: jest.fn().mockResolvedValue({
        _id: "gift123",
        name: "Hydacon T-Shirt",
        image: "tshirt.png",
      }),
    });

    mockUser.roleId = null;

    const redeemData = {
      userId: "user123",
      productId: "prod123",
      rewardId: "reward123",
      rewardUidCode: "ABC-123",
      location: { lat: 0, lng: 0 },
      testRewardType: "GIFT",
    };

    const response = await createRedeem(redeemData);

    expect(response.data.pointsRewarded).toBe(5);
    expect(response.data.rewardType).toBe("GIFT");
    expect(response.data.gift).toEqual({
      id: "gift123",
      name: "Hydacon T-Shirt",
      image: "tshirt.png",
    });
    expect(response.data.bonusPoints).toBe(0);
    expect(response.data.totalPointsAwarded).toBe(5);
  });

  it("should claim a physical gift successfully", async () => {
    const Gift = require("../../src/schemas/gift.schema");
    const GiftRedemption = require("../../src/schemas/gift-redemption.schema");

    const mockRedeem = {
      _id: "redeem123",
      userId: "user123",
      scratchCardRewardType: "GIFT",
      scratchCardGiftId: "gift123",
      scratchCardGiftClaimed: false,
      save: jest.fn().mockResolvedValue(true),
    };

    const mockGift = {
      _id: "gift123",
      name: "Hydacon T-Shirt",
      image: "tshirt.png",
      stockQuantity: 10,
      reservedQuantity: 2,
      active: true,
      save: jest.fn().mockResolvedValue(true),
    };

    const mockRedemption = {
      _id: "redemption123",
      status: "PROCESSING",
    };

    Redeem.findById.mockResolvedValue(mockRedeem);
    Gift.findById.mockReturnValue({
      session: jest.fn().mockResolvedValue(mockGift),
    });
    // For the initial active check
    Gift.findById.mockImplementationOnce(() => Promise.resolve(mockGift));

    GiftRedemption.prototype.save = jest.fn().mockResolvedValue(mockRedemption);

    const claimData = {
      shippingAddress: {
        addressLine1: "123 Main St",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
      },
    };

    const response = await claimGift("redeem123", claimData, { _id: "user123" });

    expect(response.message).toBe("Gift claimed successfully");
    expect(mockRedeem.scratchCardGiftClaimed).toBe(true);
    expect(mockGift.reservedQuantity).toBe(3);
    expect(mockRedeem.save).toHaveBeenCalled();
    expect(mockGift.save).toHaveBeenCalled();
  });
});

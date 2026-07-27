const { createRedeem } = require("../redeems.service");
const User = require("../../../schemas/user.schema");
const Role = require("../../../schemas/role.schema");
const Product = require("../../../schemas/product.schema");
const Reward = require("../../../schemas/reward.schema");
const Redeem = require("../../../schemas/redeem.schema");
const Gift = require("../../../schemas/gift.schema");

// Mocking the schemas and services
jest.mock("../../../schemas/user.schema");
jest.mock("../../../schemas/role.schema");
jest.mock("../../../schemas/product.schema");
jest.mock("../../../schemas/reward.schema");
jest.mock("../../../schemas/redeem.schema");
jest.mock("../../../schemas/gift.schema");
jest.mock("../../../schemas/gift-redemption.schema");
jest.mock("../../../schemas/app-config.schema");
jest.mock("../../../schemas/tier-configuration.schema");
jest.mock("../../../schemas/scratch-card-rule.schema");
jest.mock("../../../schemas/scratch-card.schema", () => ({
  create: jest.fn().mockResolvedValue([{ _id: "scratch123" }]),
}));
jest.mock("../../../modules/gift/gift.service", () => ({
  awardPhysicalGiftToUser: jest.fn().mockResolvedValue({ success: true }),
  awardGiftToUser: jest
    .fn()
    .mockResolvedValue({ success: true, requiresClaim: true }),
}));
jest.mock("../../../schemas/contest-entry.schema", () => ({
  ContestEntry: {
    findOneAndUpdate: jest.fn().mockResolvedValue(true),
  },
}));
jest.mock("../../../schemas/contest.schema", () => ({
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
jest.mock("../../../schemas/app-config.schema");
jest.mock("../../../functions/fcm", () => ({
  sendFcmNotifications: jest.fn(),
}));
jest.mock("../../../modules/loyalty/loyalty.service", () => ({
  getOrCreateUserProgress: jest.fn().mockResolvedValue({
    seasonId: "season123",
    currentTierId: { _id: "tier123" },
  }),
  processQrScanPoints: jest.fn().mockResolvedValue(true),
  resolveActiveSeason: jest.fn().mockResolvedValue({ _id: "season123" }),
  addBonusPoints: jest.fn().mockResolvedValue({
    message: "Bonus points successfully added",
    points: 50,
  }),
  processLoyaltyAndContestsAfterScan: jest.fn().mockResolvedValue(null),
}));

describe("Weighted Rewards Calculation", () => {
  let mockUser, mockRole, mockProduct, mockReward;

  beforeEach(() => {
    jest.clearAllMocks();

    const ScratchCardRule = require("../../../schemas/scratch-card-rule.schema");
    ScratchCardRule.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });

    const TierConfiguration = require("../../../schemas/tier-configuration.schema");
    TierConfiguration.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ pointMultiplier: 1.0 }),
    });

    const AppConfig = require("../../../schemas/app-config.schema");
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

    const loyaltyService = require("../../../modules/loyalty/loyalty.service");
    expect(loyaltyService.addBonusPoints).toHaveBeenCalledWith(
      "user123",
      50,
      expect.stringContaining("Scratch card bonus points"),
      undefined, // in mock Redeem.create doesn't return real ID or it's mock
      expect.objectContaining({
        skipQpSync: true,
        skipLifetimePoints: true,
        source: "SCRATCH_CARD_BONUS",
      }),
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
      expect.any(Object),
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
      expect.any(Object),
    );
  });

  it("should award 0 bonus points if min and max bonus points are 0 in AppConfig", async () => {
    const AppConfig = require("../../../schemas/app-config.schema");
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

    const loyaltyService = require("../../../modules/loyalty/loyalty.service");
    expect(loyaltyService.addBonusPoints).not.toHaveBeenCalled();
  });

  it("should award a physical gift if rewardType is GIFT", async () => {
    const Gift = require("../../../schemas/gift.schema");
    Gift.exists.mockResolvedValue(true);
    Gift.countDocuments.mockResolvedValue(1);
    Gift.findById.mockResolvedValue({
      _id: "gift123",
      name: "Hydacon T-Shirt",
      image: "tshirt.png",
      active: true,
      giftType: "physical",
    });
    Gift.findOne.mockReturnValue({
      skip: jest.fn().mockResolvedValue({
        _id: "gift123",
        name: "Hydacon T-Shirt",
        image: "tshirt.png",
        active: true,
        giftType: "physical",
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
      giftType: "physical",
      requiresClaim: true,
    });
    expect(response.data.bonusPoints).toBe(0);
    expect(response.data.totalPointsAwarded).toBe(5);
  });
  it("should fallback to POINTS if gift award fails (e.g. duplicate or out of stock)", async () => {
    Gift.exists.mockResolvedValue(true);
    Gift.countDocuments.mockResolvedValue(1);
    Gift.findById.mockResolvedValue({
      _id: "gift123",
      name: "Hydacon T-Shirt",
      image: "tshirt.png",
      active: true,
      giftType: "physical",
    });
    Gift.findOne.mockReturnValue({
      skip: jest.fn().mockResolvedValue({
        _id: "gift123",
        name: "Hydacon T-Shirt",
        image: "tshirt.png",
        active: true,
        giftType: "physical",
      }),
    });

    const giftService = require("../../../modules/gift/gift.service");
    // Simulate failure during gift award (e.g. user already has an unclaimed reward for this gift)
    giftService.awardGiftToUser.mockResolvedValueOnce({
      success: false,
      message: "User already has a pending unclaimed reward for this gift.",
      duplicate: true,
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

    // Assert that the API response falls back to POINTS
    expect(response.data.pointsRewarded).toBe(5); // base points
    expect(response.data.rewardType).toBe("POINTS");
    expect(response.data.gift).toBeNull();

    // Assert that the ScratchCard document is created with POINTS, not GIFT
    const ScratchCard = require("../../../schemas/scratch-card.schema");
    expect(ScratchCard.create).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          rewardType: "POINTS",
          giftId: null,
        }),
      ]),
      expect.any(Object),
    );
  });
});

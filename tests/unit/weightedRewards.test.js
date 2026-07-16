const { createRedeem } = require("../../src/modules/redeems/redeems.service");
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
jest.mock("../../src/schemas/tier-configuration.schema");
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
}));

describe("Weighted Rewards Calculation", () => {
  let mockUser, mockRole, mockProduct, mockReward;

  beforeEach(() => {
    jest.clearAllMocks();

    const TierConfiguration = require("../../src/schemas/tier-configuration.schema");
    TierConfiguration.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ pointMultiplier: 1.0 }),
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
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "user123",
      expect.objectContaining({
        $inc: { totalPoints: 50, lifetimePoints: 50, totalScans: 1 },
        $set: { failedScanAttempts: 0, scanBanUntil: null },
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
        $inc: { totalPoints: 10, lifetimePoints: 10, totalScans: 1 },
        $set: { failedScanAttempts: 0, scanBanUntil: null },
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
        $inc: { totalPoints: 5, lifetimePoints: 5, totalScans: 1 },
        $set: { failedScanAttempts: 0, scanBanUntil: null },
      }),
    );
  });
});

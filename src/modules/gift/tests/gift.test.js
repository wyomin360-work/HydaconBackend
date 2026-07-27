const giftService = require("../gift.service");
const giftController = require("../gift.controller");
const Gift = require("../../../schemas/gift.schema");
const GiftCategory = require("../../../schemas/gift-category.schema");
const GiftRedemption = require("../../../schemas/gift-redemption.schema");
const User = require("../../../schemas/user.schema");
const Tier = require("../../../schemas/tier.schema");
const Redeem = require("../../../schemas/redeem.schema");
const mongoose = require("mongoose");

// Mock schemas
jest.mock("../../../schemas/gift.schema");
jest.mock("../../../schemas/gift-category.schema");
jest.mock("../../../schemas/gift-redemption.schema");
jest.mock("../../../schemas/document.schema");
jest.mock("../../../schemas/user.schema");
jest.mock("../../../schemas/tier.schema");
jest.mock("../../../schemas/redeem.schema");

// Mock the RuleSet schema and evaluator used by gift.service
jest.mock("../../../schemas/rule-set.schema", () => ({
  RuleSet: {
    findById: jest.fn(),
  },
}));
jest.mock("../../../modules/rule-set/rule-set.evaluator", () => ({
  evaluateRuleSet: jest.fn(),
}));

const { RuleSet } = require("../../../schemas/rule-set.schema");
const ruleSetEvaluator = require("../../../modules/rule-set/rule-set.evaluator");

describe("Gift Service & Rules Engine Tests", () => {
  let mockUser, mockGift, mockTier, mockRedemption;

  const mockQuery = (result) => {
    const query = Promise.resolve(result);
    query.session = jest.fn().mockReturnValue(query);
    return query;
  };

  // Helper to build a standard mock Mongoose session
  const buildMockSession = () => ({
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
    withTransaction: jest.fn().mockImplementation(async (callback) => {
      return await callback();
    }),
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockUser = {
      _id: "user123",
      name: "John Doe",
      hydaconCoins: 500,
      currentTierId: "tierSilver",
      areaOfOperation: "California",
      save: jest.fn().mockResolvedValue(true),
    };

    mockTier = {
      _id: "tierSilver",
      name: "Silver",
      rank: 2,
    };

    mockGift = {
      _id: "gift123",
      name: "Premium Tool",
      description: "A very nice tool",
      giftType: "physical",
      priceInCoins: 200,
      stockQuantity: 10,
      reservedQuantity: 2,
      active: true,
      ruleSetId: "ruleSet123",
      rewardedUsers: [],
      save: jest.fn().mockResolvedValue(true),
    };

    mockRedemption = {
      _id: "redemption123",
      userId: "user123",
      giftId: {
        _id: "gift123",
        name: "Premium Tool",
        priceInCoins: 200,
      },
      coinsUsed: 200,
      status: "Processing",
      shippingAddress: {
        addressLine1: "123 Main St",
        city: "San Jose",
        state: "CA",
        pincode: "95112",
      },
    };

    // Mock Mongoose model lookups
    mongoose.model = jest.fn().mockImplementation((modelName) => {
      if (modelName === "Tier") return Tier;
      if (modelName === "Redeem") return Redeem;
      if (modelName === "User") return User;
      if (modelName === "Gift") return Gift;
      if (modelName === "GiftRedemption") return GiftRedemption;
      return null;
    });

    User.findById.mockImplementation(() => mockQuery(mockUser));
    Gift.findById.mockImplementation(() => mockQuery(mockGift));
    Tier.findById.mockImplementation((id) => {
      if (id === "tierSilver") return mockQuery(mockTier);
      return mockQuery(null);
    });
    Redeem.countDocuments.mockImplementation(() => mockQuery(0));
    const mockPopulate = jest.fn().mockReturnThis();
    GiftRedemption.findById.mockReturnValue({
      populate: mockPopulate,
      lean: jest.fn().mockResolvedValue(mockRedemption),
      session: jest.fn().mockResolvedValue(mockRedemption),
    });

    // Default: RuleSet evaluator passes all rules
    RuleSet.findById.mockImplementation(() =>
      mockQuery({
        _id: "ruleSet123",
        name: "Test RuleSet",
        logicOperator: "AND",
        rules: [],
      }),
    );
    ruleSetEvaluator.evaluateRuleSet.mockResolvedValue({
      eligible: true,
      reasons: [],
      evaluatedRules: [],
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("checkEligibility Rules Engine", () => {
    it("should pass eligibility when all rules are satisfied", async () => {
      const result = await giftService.getGiftEligibility("user123", "gift123");

      expect(result.success).toBe(true);
      expect(result.data.eligible).toBe(true);
      expect(result.data.reasons.length).toBe(0);
      expect(result.data.rules.coins.satisfied).toBe(true);
    });

    it("should fail when coins are insufficient", async () => {
      mockUser.hydaconCoins = 100; // Required is 200

      const result = await giftService.getGiftEligibility("user123", "gift123");

      expect(result.success).toBe(true);
      expect(result.data.eligible).toBe(false);
      expect(result.data.rules.coins.satisfied).toBe(false);
      expect(result.data.reasons[0]).toContain("Requires at least 200 coins");
    });

    it("should fail when RuleSet evaluator returns not eligible (e.g. tier insufficient)", async () => {
      ruleSetEvaluator.evaluateRuleSet.mockResolvedValue({
        eligible: false,
        reasons: ["Requires Gold membership tier or above (Current: Silver)"],
        evaluatedRules: [{ type: "TIER", satisfied: false }],
      });

      const result = await giftService.getGiftEligibility("user123", "gift123");

      expect(result.success).toBe(true);
      expect(result.data.eligible).toBe(false);
      expect(result.data.reasons[0]).toContain("Requires Gold membership tier");
    });

    it("should pass eligibility when gift has no ruleSetId", async () => {
      mockGift.ruleSetId = null; // No ruleset attached

      const result = await giftService.getGiftEligibility("user123", "gift123");

      expect(result.success).toBe(true);
      expect(result.data.eligible).toBe(true);
      expect(result.data.reasons.length).toBe(0);
      expect(ruleSetEvaluator.evaluateRuleSet).not.toHaveBeenCalled();
    });

    it("should report isRewardedUser=true if user has a valid pending reward entry", async () => {
      const futureDate = new Date(Date.now() + 86400000);
      mockGift.rewardedUsers = [
        {
          _id: "entry1",
          userId: "user123",
          rewardCause: "SCRATCH_CARD",
          rewardedAt: new Date(),
          expiresAt: futureDate,
        },
      ];

      Gift.findById.mockImplementation(() => mockQuery(mockGift));

      const result = await giftService.getGiftEligibility("user123", "gift123");

      expect(result.success).toBe(true);
      expect(result.data.isRewardedUser).toBe(true);
      // Coins + ruleset checks are waived
      expect(result.data.eligible).toBe(true);
      expect(ruleSetEvaluator.evaluateRuleSet).not.toHaveBeenCalled();
    });

    it("should NOT treat expired rewardedUsers entries as valid", async () => {
      const pastDate = new Date(Date.now() - 1000); // expired
      mockGift.rewardedUsers = [
        {
          _id: "entry1",
          userId: "user123",
          rewardCause: "SCRATCH_CARD",
          rewardedAt: new Date(),
          expiresAt: pastDate,
        },
      ];
      mockUser.hydaconCoins = 50; // not enough to buy normally

      Gift.findById.mockImplementation(() => mockQuery(mockGift));

      const result = await giftService.getGiftEligibility("user123", "gift123");

      expect(result.data.isRewardedUser).toBe(false);
      // Falls back to normal eligibility — should fail (50 < 200 coins)
      expect(result.data.eligible).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("redeemGift — direct purchase path", () => {
    it("should deduct user coins and reserve stock inside a transaction", async () => {
      const mockSession = buildMockSession();
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      User.findById.mockImplementation(() => mockQuery(mockUser));
      Gift.findById.mockImplementation(() => mockQuery(mockGift));

      User.findOneAndUpdate = jest.fn().mockResolvedValue(mockUser);
      Gift.findOneAndUpdate = jest.fn().mockResolvedValue(mockGift);

      GiftRedemption.prototype.save = jest
        .fn()
        .mockResolvedValue(mockRedemption);

      const response = await giftService.redeemGift("user123", {
        giftId: "gift123",
        shippingAddress: mockRedemption.shippingAddress,
      });

      expect(response.success).toBe(true);

      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "user123", hydaconCoins: { $gte: 200 } },
        { $inc: { hydaconCoins: -200 } },
        { session: mockSession, new: true },
      );

      expect(Gift.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: "gift123",
          $expr: { $gt: ["$stockQuantity", "$reservedQuantity"] },
        },
        { $inc: { reservedQuantity: 1 } },
        { session: mockSession, new: true },
      );

      expect(GiftRedemption.prototype.save).toHaveBeenCalled();
    });

    it("should fail redemption if rule set evaluator determines user is not eligible", async () => {
      const mockSession = buildMockSession();
      mockSession.withTransaction.mockImplementation(async (callback) => {
        try {
          await callback();
        } catch (error) {
          throw error;
        }
      });
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      ruleSetEvaluator.evaluateRuleSet.mockResolvedValueOnce({
        eligible: false,
        reasons: ["Failed custom rule set condition"],
        evaluatedRules: [{ type: "SCAN_COUNT", satisfied: false }],
      });

      const response = await giftService.redeemGift("user123", {
        giftId: "gift123",
        shippingAddress: mockRedemption.shippingAddress,
      });

      expect(response.success).toBe(false);
      expect(response.message).toContain("Failed custom rule set condition");
      expect(mockUser.save).not.toHaveBeenCalled();
      expect(mockGift.save).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("redeemGift — rewarded-user claim path", () => {
    const futureDate = new Date(Date.now() + 86400000 * 30);
    const rewardEntry = {
      _id: "entry1",
      userId: "user123",
      rewardCause: "SCRATCH_CARD",
      rewardCauseTitle: "Scratch & Win: Summer Campaign",
      rewardCauseId: "campaign1",
      redeemId: "redeem1",
      rewardedAt: new Date(),
      expiresAt: futureDate,
    };

    beforeEach(() => {
      mockGift.rewardedUsers = [rewardEntry];
      mockUser.hydaconCoins = 0; // User has no coins — but it doesn't matter
      Gift.findById.mockImplementation(() => mockQuery(mockGift));
    });

    it("should create a GiftRedemption with coinsUsed=0 and isReward=true (waiving coins and ruleset)", async () => {
      const mockSession = buildMockSession();
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      // findOneAndUpdate for the $pull + stock decrement
      Gift.findOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockGift,
        rewardedUsers: [], // entry removed
        reservedQuantity: 1,
        stockQuantity: 9,
      });

      GiftRedemption.prototype.save = jest.fn().mockResolvedValue({
        _id: "newRedemption1",
        coinsUsed: 0,
        isReward: true,
      });

      const response = await giftService.redeemGift("user123", {
        giftId: "gift123",
        shippingAddress: mockRedemption.shippingAddress,
      });

      expect(response.success).toBe(true);
      expect(response.message).toContain("Reward claimed successfully");

      // Coins should NOT have been deducted
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();

      // RuleSet evaluator should NOT have been called
      expect(ruleSetEvaluator.evaluateRuleSet).not.toHaveBeenCalled();

      // Stock pull + decrement must have been called atomically
      expect(Gift.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "gift123", "rewardedUsers._id": rewardEntry._id },
        {
          $pull: { rewardedUsers: { _id: rewardEntry._id } },
          $inc: { reservedQuantity: -1, stockQuantity: -1 },
        },
        { session: mockSession, new: true },
      );

      // GiftRedemption must have been saved
      expect(GiftRedemption.prototype.save).toHaveBeenCalled();
    });

    it("should waive ruleset even if gift has a restrictive RuleSet attached", async () => {
      // Make ruleset FAIL — but user should still succeed because they're rewarded
      ruleSetEvaluator.evaluateRuleSet.mockResolvedValue({
        eligible: false,
        reasons: ["Requires Gold tier"],
        evaluatedRules: [],
      });

      const mockSession = buildMockSession();
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);
      Gift.findOneAndUpdate = jest
        .fn()
        .mockResolvedValue({ ...mockGift, rewardedUsers: [] });
      GiftRedemption.prototype.save = jest
        .fn()
        .mockResolvedValue({ _id: "r1", coinsUsed: 0 });

      const response = await giftService.redeemGift("user123", {
        giftId: "gift123",
        shippingAddress: mockRedemption.shippingAddress,
      });

      expect(response.success).toBe(true);
      // evaluateRuleSet should NOT have been called
      expect(ruleSetEvaluator.evaluateRuleSet).not.toHaveBeenCalled();
    });

    it("should fail if reward entry is no longer in rewardedUsers (already claimed)", async () => {
      mockGift.rewardedUsers = []; // Entry already removed
      Gift.findById.mockImplementation(() => mockQuery(mockGift));

      const mockSession = buildMockSession();
      mockSession.withTransaction.mockImplementation(async (callback) => {
        try {
          await callback();
        } catch (e) {
          throw e;
        }
      });
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      // findOneAndUpdate returns null = entry not found
      Gift.findOneAndUpdate = jest.fn().mockResolvedValue(null);

      // This user is NOT in rewardedUsers, so it falls to direct purchase
      // Direct purchase: user has 0 coins → should fail coin check
      const response = await giftService.redeemGift("user123", {
        giftId: "gift123",
        shippingAddress: mockRedemption.shippingAddress,
      });

      expect(response.success).toBe(false);
    });

    it("should fail if shippingAddress is missing even for rewarded users", async () => {
      const mockSession = buildMockSession();
      mockSession.withTransaction.mockImplementation(async (callback) => {
        try {
          await callback();
        } catch (e) {
          throw e;
        }
      });
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      const response = await giftService.redeemGift("user123", {
        giftId: "gift123",
        // shippingAddress intentionally omitted
      });

      expect(response.success).toBe(false);
      expect(response.message).toContain("Shipping address is required");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("awardPhysicalGiftToUser", () => {
    beforeEach(() => {
      mockGift.rewardedUsers = [];
    });

    it("should add user to rewardedUsers and reserve stock atomically", async () => {
      const mockSession = buildMockSession();

      const updatedGift = {
        ...mockGift,
        rewardedUsers: [{ userId: "user123", rewardCause: "SCRATCH_CARD" }],
        reservedQuantity: mockGift.reservedQuantity + 1,
      };
      Gift.findOneAndUpdate = jest.fn().mockResolvedValue(updatedGift);

      const causeData = {
        rewardCause: "SCRATCH_CARD",
        rewardCauseId: "campaign1",
        rewardCauseTitle: "Scratch & Win",
        redeemId: "redeem1",
        expiresAt: new Date(Date.now() + 86400000 * 30),
      };

      const result = await giftService.awardPhysicalGiftToUser(
        "user123",
        mockGift,
        causeData,
        mockSession,
      );

      expect(result.success).toBe(true);
      expect(Gift.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: mockGift._id,
          $expr: { $gt: ["$stockQuantity", "$reservedQuantity"] },
        },
        expect.objectContaining({
          $push: expect.objectContaining({ rewardedUsers: expect.any(Object) }),
          $inc: { reservedQuantity: 1 },
        }),
        { session: mockSession, new: true },
      );
    });

    it("should return success=false when gift is out of stock", async () => {
      const mockSession = buildMockSession();
      Gift.findOneAndUpdate = jest.fn().mockResolvedValue(null); // No stock

      const result = await giftService.awardPhysicalGiftToUser(
        "user123",
        mockGift,
        { rewardCause: "SCRATCH_CARD" },
        mockSession,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("out of stock");
    });

    it("should prevent duplicate pending rewards for the same user + gift", async () => {
      const mockSession = buildMockSession();
      // User already has an unclaimed entry
      mockGift.rewardedUsers = [
        {
          userId: "user123",
          rewardCause: "SCRATCH_CARD",
          rewardedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      ];

      const result = await giftService.awardPhysicalGiftToUser(
        "user123",
        mockGift,
        { rewardCause: "SCRATCH_CARD" },
        mockSession,
      );

      expect(result.success).toBe(false);
      expect(result.duplicate).toBe(true);
      expect(Gift.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("should allow awarding if previous entry is expired", async () => {
      const mockSession = buildMockSession();
      mockGift.rewardedUsers = [
        {
          userId: "user123",
          rewardCause: "SCRATCH_CARD",
          rewardedAt: new Date(),
          expiresAt: new Date(Date.now() - 1000), // expired
        },
      ];

      Gift.findOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockGift,
        rewardedUsers: [{ userId: "user123", rewardCause: "SCRATCH_CARD" }],
      });

      const result = await giftService.awardPhysicalGiftToUser(
        "user123",
        mockGift,
        { rewardCause: "SCRATCH_CARD" },
        mockSession,
      );

      expect(result.success).toBe(true);
      expect(Gift.findOneAndUpdate).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("getUserRewardedGifts", () => {
    it("should return gifts with valid pending reward entries for the user", async () => {
      const futureDate = new Date(Date.now() + 86400000);
      const mockGiftWithReward = {
        _id: "gift999",
        name: "Mystery Box",
        giftType: "physical",
        image: null,
        themeColor: null,
        description: "A mystery",
        categoryId: { _id: "cat1", name: "Tools" },
        rewardedUsers: [
          {
            userId: "user123",
            rewardCause: "SCRATCH_CARD",
            rewardedAt: new Date(),
            expiresAt: futureDate,
          },
        ],
      };

      Gift.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockGiftWithReward]),
      });

      const result = await giftService.getUserRewardedGifts("user123");

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].gift._id).toBe("gift999");
      expect(result.data[0].rewardEntry.rewardCause).toBe("SCRATCH_CARD");
    });

    it("should exclude expired reward entries", async () => {
      const pastDate = new Date(Date.now() - 1000); // expired
      const mockGiftExpired = {
        _id: "giftExpired",
        name: "Expired Prize",
        giftType: "physical",
        rewardedUsers: [
          {
            userId: "user123",
            rewardCause: "SCRATCH_CARD",
            expiresAt: pastDate,
          },
        ],
      };

      Gift.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockGiftExpired]),
      });

      const result = await giftService.getUserRewardedGifts("user123");

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(0); // Expired entry filtered out
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("getUserRedemptionDetails ownership validation", () => {
    it("should return redemption details if user is the owner", async () => {
      const response = await giftService.getUserRedemptionDetails(
        "user123",
        "redemption123",
      );
      expect(response.success).toBe(true);
      expect(response.data._id).toBe("redemption123");
    });

    it("should deny access if user is not the owner", async () => {
      const response = await giftService.getUserRedemptionDetails(
        "differentUser",
        "redemption123",
      );
      expect(response.success).toBe(false);
      expect(response.message).toBe("Unauthorized access");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("adminUpdateRedemption validation and terminal states", () => {
    it("should fail validation if status is not valid", async () => {
      const response = await giftService.adminUpdateRedemption(
        "redemption123",
        { status: "InvalidStatus" },
      );
      expect(response.success).toBe(false);
      expect(response.message).toBe("Invalid redemption status");
    });

    it("should throw error if attempting to change status from Cancelled", async () => {
      const mockSession = buildMockSession();
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      const mockCancelledRedemption = {
        ...mockRedemption,
        status: "Cancelled",
        save: jest.fn().mockResolvedValue(true),
      };

      GiftRedemption.findById.mockReturnValue({
        session: jest.fn().mockReturnValue(mockCancelledRedemption),
      });

      const response = await giftService.adminUpdateRedemption(
        "redemption123",
        { status: "Shipped" },
      );
      expect(response.success).toBe(false);
      expect(response.message).toContain(
        "Cannot change status from Cancelled to Shipped",
      );
    });
  });
});

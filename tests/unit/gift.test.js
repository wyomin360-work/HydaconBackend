const giftService = require("../../src/modules/gift/gift.service");
const giftController = require("../../src/modules/gift/gift.controller");
const Gift = require("../../src/schemas/gift.schema");
const GiftCategory = require("../../src/schemas/gift-category.schema");
const GiftRedemption = require("../../src/schemas/gift-redemption.schema");
const User = require("../../src/schemas/user.schema");
const Tier = require("../../src/schemas/tier.schema");
const Redeem = require("../../src/schemas/redeem.schema");
const mongoose = require("mongoose");

// Mock schemas
jest.mock("../../src/schemas/gift.schema");
jest.mock("../../src/schemas/gift-category.schema");
jest.mock("../../src/schemas/gift-redemption.schema");
jest.mock("../../src/schemas/user.schema");
jest.mock("../../src/schemas/tier.schema");
jest.mock("../../src/schemas/redeem.schema");

// Mock the RuleSet schema and evaluator used by gift.service
jest.mock("../../src/schemas/rule-set.schema", () => ({
  RuleSet: {
    findById: jest.fn(),
  },
}));
jest.mock("../../src/modules/rule-set/rule-set.evaluator", () => ({
  evaluateRuleSet: jest.fn(),
}));

const { RuleSet } = require("../../src/schemas/rule-set.schema");
const ruleSetEvaluator = require("../../src/modules/rule-set/rule-set.evaluator");

describe("Gift Service & Rules Engine Tests", () => {
  let mockUser, mockGift, mockTier, mockRedemption;

  const mockQuery = (result) => {
    const query = Promise.resolve(result);
    query.session = jest.fn().mockReturnValue(query);
    return query;
  };

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
      priceInCoins: 200,
      stockQuantity: 10,
      reservedQuantity: 2,
      active: true,
      ruleSetId: "ruleSet123",
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
    GiftRedemption.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockRedemption),
    });

    // Default: RuleSet evaluator passes all rules
    RuleSet.findById.mockImplementation(() => mockQuery({ _id: "ruleSet123", name: "Test RuleSet", logicOperator: "AND", rules: [] }));
    ruleSetEvaluator.evaluateRuleSet.mockResolvedValue({
      eligible: true,
      reasons: [],
      evaluatedRules: [],
    });
  });

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

    it("should fail when RuleSet evaluator returns not eligible (e.g. scans insufficient)", async () => {
      ruleSetEvaluator.evaluateRuleSet.mockResolvedValue({
        eligible: false,
        reasons: ["Requires at least 5 bag scans this month (Current: 3)"],
        evaluatedRules: [{ type: "SCAN_COUNT", satisfied: false }],
      });

      const result = await giftService.getGiftEligibility("user123", "gift123");

      expect(result.success).toBe(true);
      expect(result.data.eligible).toBe(false);
      expect(result.data.reasons[0]).toContain("Requires at least 5 bag scans");
    });

    it("should fail when RuleSet evaluator returns region not matched", async () => {
      ruleSetEvaluator.evaluateRuleSet.mockResolvedValue({
        eligible: false,
        reasons: ["Gift is not available in your region (New York)"],
        evaluatedRules: [{ type: "REGION", satisfied: false }],
      });

      const result = await giftService.getGiftEligibility("user123", "gift123");

      expect(result.success).toBe(true);
      expect(result.data.eligible).toBe(false);
      expect(result.data.reasons[0]).toContain(
        "Gift is not available in your region",
      );
    });

    it("should pass eligibility when gift has no ruleSetId", async () => {
      mockGift.ruleSetId = null; // No ruleset attached

      const result = await giftService.getGiftEligibility("user123", "gift123");

      expect(result.success).toBe(true);
      expect(result.data.eligible).toBe(true);
      expect(result.data.reasons.length).toBe(0);
      // evaluateRuleSet should NOT have been called
      expect(ruleSetEvaluator.evaluateRuleSet).not.toHaveBeenCalled();
    });
  });

  describe("redeemGift workflow", () => {
    it("should successfully redeem and deduct user coins and reserve stock inside a transaction", async () => {
      // Mock session start & commit
      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn(),
        withTransaction: jest.fn().mockImplementation(async (callback) => {
          return await callback();
        }),
      };
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      User.findById.mockImplementation(() => mockQuery(mockUser));
      Gift.findById.mockImplementation(() => mockQuery(mockGift));
      Tier.findById.mockImplementation((id) => {
        if (id === "tierSilver") return mockQuery(mockTier);
        return mockQuery(null);
      });
      Redeem.countDocuments.mockImplementation(() => mockQuery(6));

      User.findOneAndUpdate = jest.fn().mockResolvedValue(mockUser);
      Gift.findOneAndUpdate = jest.fn().mockResolvedValue(mockGift);

      GiftRedemption.prototype.save = jest.fn().mockResolvedValue(mockRedemption);

      const response = await giftService.redeemGift("user123", {
        giftId: "gift123",
        shippingAddress: mockRedemption.shippingAddress,
      });
      
      expect(response.success).toBe(true);
      
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "user123", hydaconCoins: { $gte: 200 } },
        { $inc: { hydaconCoins: -200 } },
        { session: mockSession, new: true }
      );
      
      expect(Gift.findOneAndUpdate).toHaveBeenCalledWith(
        { 
          _id: "gift123", 
          $expr: { $gt: ["$stockQuantity", "$reservedQuantity"] } 
        },
        { $inc: { reservedQuantity: 1 } },
        { session: mockSession, new: true }
      );
      
      expect(GiftRedemption.prototype.save).toHaveBeenCalled();
    });

    it("should fail redemption if rule set evaluator determines user is not eligible", async () => {
      // Mock session start & commit
      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn(),
        withTransaction: jest.fn().mockImplementation(async (callback) => {
          try {
            await callback();
          } catch (error) {
            throw error;
          }
        }),
      };
      mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

      User.findById.mockImplementation(() => mockQuery(mockUser));
      Gift.findById.mockImplementation(() => mockQuery(mockGift));

      // Mock evaluator to fail
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
      expect(ruleSetEvaluator.evaluateRuleSet).toHaveBeenCalled();
      
      // Ensure stock/coins weren't modified and nothing was saved
      expect(mockUser.save).not.toHaveBeenCalled();
      expect(mockGift.save).not.toHaveBeenCalled();
    });
  });

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
      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn(),
        withTransaction: jest.fn().mockImplementation(async (callback) => {
          return await callback();
        }),
      };
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

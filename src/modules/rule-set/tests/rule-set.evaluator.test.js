const mongoose = require("mongoose");
const ruleSetEvaluator = require("../rule-set.evaluator");
const {
  RuleType,
  RuleScope,
  RuleOperator,
  RuleLogicOperator,
} = require("../../../schemas/rule-set.schema");

// Mock mongoose
jest.mock("mongoose", () => {
  const models = {};
  const mockMongoose = {
    model: jest.fn((modelName) => {
      if (!models[modelName]) {
        models[modelName] = {
          findById: jest.fn().mockReturnThis(),
          findOne: jest.fn().mockReturnThis(),
          find: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          countDocuments: jest.fn().mockReturnThis(),
          session: jest.fn(),
        };
      }
      return models[modelName];
    }),
    Types: {
      ObjectId: Object.assign(
        jest.fn(() => "mockedObjectId"),
        {
          isValid: jest.fn().mockReturnValue(true),
        },
      ),
    },
  };

  // Make Schema a constructor
  function MockSchema() {}
  MockSchema.Types = {
    ObjectId: "ObjectId",
    Mixed: "Mixed",
  };

  mockMongoose.Schema = MockSchema;

  return mockMongoose;
});

describe("RuleSet Evaluator", () => {
  let mockUser;
  let session;

  beforeEach(() => {
    jest.clearAllMocks();
    session = {};
    mockUser = {
      _id: "user123",
      currentTierId: "tier123",
      hydaconCoins: 500,
      cashBalance: 100,
      totalPoints: 200,
      profileCompletionPercentage: 100,
      kycStatus: "APPROVED",
      areaOfOperation: "Delhi",
      referralsCount: 5,
      successfulReferralsCount: 2,
      currentStreak: 10,
    };
  });

  describe("evaluateRuleSet", () => {
    it("should return false if rule set is not active", async () => {
      const ruleSet = { active: false, rules: [] };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("Rule set is not active");
    });

    it("should evaluate TIER rule correctly by looking up Tier rank", async () => {
      const Tier = mongoose.model("Tier");
      Tier.session.mockResolvedValue({
        _id: "tier123",
        rank: 2,
      });

      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          {
            type: RuleType.TIER,
            operator: RuleOperator.GTE,
            value: 2,
          },
        ],
      };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(true);
      expect(Tier.findById).toHaveBeenCalledWith("tier123");
    });

    it("should evaluate boolean strings correctly", async () => {
      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          {
            type: RuleType.PROFILE_COMPLETED,
            operator: RuleOperator.EQ,
            value: "true", // UI sends string
          },
          {
            type: RuleType.KYC_COMPLETED,
            operator: RuleOperator.EQ,
            value: "true",
          },
        ],
      };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(true);
      expect(result.evaluatedRules[0].satisfied).toBe(true);
      expect(result.evaluatedRules[1].satisfied).toBe(true);
    });

    it("should evaluate basic user fields (HYDACOINS, CASH_BALANCE, REDEEM_POINTS)", async () => {
      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          { type: RuleType.HYDACOINS, operator: RuleOperator.GTE, value: 500 },
          {
            type: RuleType.CASH_BALANCE,
            operator: RuleOperator.LTE,
            value: 150,
          },
          {
            type: RuleType.REDEEM_POINTS,
            operator: RuleOperator.EQ,
            value: 200,
          },
        ],
      };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(true);
      expect(result.evaluatedRules.every((r) => r.satisfied)).toBe(true);
    });

    it("should fail if AND logic requires all but one fails", async () => {
      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          { type: RuleType.HYDACOINS, operator: RuleOperator.GTE, value: 500 }, // Passes
          {
            type: RuleType.REDEEM_POINTS,
            operator: RuleOperator.GTE,
            value: 300,
          }, // Fails
        ],
      };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("Requirement not met for REDEEM_POINTS");
    });

    it("should pass if OR logic requires only one to pass", async () => {
      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.OR,
        rules: [
          { type: RuleType.HYDACOINS, operator: RuleOperator.GTE, value: 1000 }, // Fails
          {
            type: RuleType.REDEEM_POINTS,
            operator: RuleOperator.GTE,
            value: 150,
          }, // Passes
        ],
      };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(true);
    });

    it("should query MongoDB for PRODUCT_SCAN", async () => {
      const Redeem = mongoose.model("Redeem");
      Redeem.session.mockResolvedValue(5); // User scanned the product 5 times

      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          {
            type: RuleType.SCAN_COUNT,
            scope: RuleScope.PRODUCT,
            operator: RuleOperator.GTE,
            value: 5,
            metadata: { targetId: "product123" },
          },
        ],
      };

      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(true);
      expect(Redeem.countDocuments).toHaveBeenCalledWith({
        userId: mockUser._id,
        productId: "product123",
      });
    });

    it("should evaluate limits MAX_REDEMPTIONS_PER_USER using context", async () => {
      const GiftRedemption = mongoose.model("GiftRedemption");
      GiftRedemption.session.mockResolvedValue(2); // User redeemed this 2 times before

      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          {
            type: RuleType.MAX_REDEMPTIONS_PER_USER,
            operator: RuleOperator.LTE,
            value: 2, // Max allowed is 2
          },
        ],
      };

      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        { targetId: "gift123" },
        session,
      );
      expect(result.eligible).toBe(true);
      expect(GiftRedemption.countDocuments).toHaveBeenCalledWith({
        userId: mockUser._id,
        giftId: "gift123",
      });
    });

    it("should evaluate CATEGORY_SCAN correctly by mapping category to products", async () => {
      const Product = mongoose.model("Product");
      const Redeem = mongoose.model("Redeem");

      // Mock category lookup
      Product.session.mockResolvedValue([{ _id: "prod1" }, { _id: "prod2" }]);
      // Mock redeem count
      Redeem.session.mockResolvedValue(10);

      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          {
            type: RuleType.SCAN_COUNT,
            scope: RuleScope.CATEGORY,
            operator: RuleOperator.GTE,
            value: 10,
            metadata: { targetCategory: { _id: "cat123" } },
          },
        ],
      };

      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(true);
      expect(Product.find).toHaveBeenCalledWith({ categoryId: "cat123" });
      expect(Redeem.countDocuments).toHaveBeenCalledWith({
        userId: mockUser._id,
        productId: { $in: ["prod1", "prod2"] },
      });
    });

    it("should evaluate newly added referral and streak metrics", async () => {
      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          { type: RuleType.REFERRALS, operator: RuleOperator.GTE, value: 5 },
          { type: RuleType.STREAK, operator: RuleOperator.EQ, value: 10 },
        ],
      };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(true);
    });

    it("should evaluate TIER rule correctly by looking up Tier rank", async () => {
      const Tier = mongoose.model("Tier");
      Tier.session.mockResolvedValue({ _id: "tier123", name: "Gold", rank: 2 });

      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          {
            type: RuleType.TIER,
            operator: RuleOperator.GTE,
            value: 2,
          },
        ],
      };

      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(true);
      expect(Tier.findById).toHaveBeenCalledWith("tier123");
    });

    it("should evaluate SEASON_POINTS, SEASON_TIER, and SEASON_RANK correctly by looking up active season and progress", async () => {
      const LoyaltySeason = mongoose.model("LoyaltySeason");
      const UserTierProgress = mongoose.model("UserTierProgress");
      const Tier = mongoose.model("Tier");

      // Mock active season lookup
      LoyaltySeason.session.mockResolvedValue({
        _id: "season123",
        active: true,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      });

      // Mock progress lookup
      UserTierProgress.session.mockResolvedValue({
        userId: "user123",
        seasonId: "season123",
        currentPoint: 450,
        currentTierId: "tierGold",
      });

      // Mock tier lookup
      Tier.session.mockResolvedValue({
        _id: "tierGold",
        rank: 3,
      });

      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          {
            type: RuleType.SEASON_POINTS,
            operator: RuleOperator.GTE,
            value: 400,
          },
          { type: RuleType.SEASON_RANK, operator: RuleOperator.EQ, value: 3 },
          {
            type: RuleType.SEASON_TIER,
            operator: RuleOperator.EQ,
            value: "tierGold",
          },
        ],
      };

      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(true);
      expect(LoyaltySeason.findOne).toHaveBeenCalledWith({ active: true });
      expect(UserTierProgress.findOne).toHaveBeenCalledWith({
        userId: "user123",
        seasonId: "season123",
      });
      expect(Tier.findById).toHaveBeenCalledWith("tierGold");
    });

    it("should evaluate SCAN_COUNT with SEASON scope correctly using active season range", async () => {
      const LoyaltySeason = mongoose.model("LoyaltySeason");
      const Redeem = mongoose.model("Redeem");

      const startDate = new Date("2026-06-01");
      const endDate = new Date("2026-06-30");

      LoyaltySeason.session.mockResolvedValue({
        _id: "season123",
        active: true,
        startDate,
        endDate,
      });

      Redeem.session.mockResolvedValue(15);

      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          {
            type: RuleType.SCAN_COUNT,
            scope: RuleScope.SEASON,
            operator: RuleOperator.GTE,
            value: 10,
          },
        ],
      };

      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(true);
      expect(LoyaltySeason.findOne).toHaveBeenCalledWith({ active: true });
      expect(Redeem.countDocuments).toHaveBeenCalledWith({
        userId: "user123",
        createdAt: { $gte: startDate, $lte: endDate },
      });
    });

    it("should parse string numbers correctly for numeric comparisons", async () => {
      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          { type: RuleType.HYDACOINS, operator: RuleOperator.EQ, value: "500" }, // UI sends as string
          { type: RuleType.STREAK, operator: RuleOperator.GTE, value: "8" },
        ],
      };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(true);
      expect(result.evaluatedRules[0].satisfied).toBe(true);
      expect(result.evaluatedRules[1].satisfied).toBe(true);
    });

    it("should evaluate REGION with IN operator correctly against strings", async () => {
      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          {
            type: RuleType.REGION,
            operator: RuleOperator.IN,
            value: ["Delhi", "Mumbai"],
          },
        ],
      };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(true);
    });

    it("should evaluate REGION with IN operator correctly against location objects", async () => {
      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          {
            type: RuleType.REGION,
            operator: RuleOperator.IN,
            value: [
              {
                locationType: "STATE",
                country: "INDIA",
                state: "Delhi",
              },
            ],
          },
        ],
      };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(true);
    });
    it("should return true for an empty rule set", async () => {
      const ruleSet = { active: true, rules: [] };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(true);
      expect(result.evaluatedRules.length).toBe(0);
    });

    it("should return false if rule set is not yet valid (validFrom)", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const ruleSet = { active: true, validFrom: futureDate, rules: [] };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("Rule set is not yet valid");
    });

    it("should return false if rule set has expired (validUntil)", async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const ruleSet = { active: true, validUntil: pastDate, rules: [] };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("Rule set has expired");
    });

    it("should query MongoDB for PRODUCT_SCAN using targetProduct metadata", async () => {
      const Redeem = mongoose.model("Redeem");
      Redeem.session.mockResolvedValue(5);

      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          {
            type: RuleType.SCAN_COUNT,
            scope: RuleScope.PRODUCT,
            operator: RuleOperator.GTE,
            value: 5,
            metadata: { targetProduct: { _id: "product123" } },
          },
        ],
      };

      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {
          targetProduct: { _id: "prod123" },
        },
        session,
      );
      expect(result.eligible).toBe(true);
      expect(Redeem.countDocuments).toHaveBeenCalledWith({
        userId: mockUser._id,
        productId: "product123",
      });
    });

    it("should evaluate CURRENT_PRODUCT correctly by checking context.productId", async () => {
      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          {
            type: RuleType.CURRENT_PRODUCT,
            operator: RuleOperator.EQ,
            value: "prod123",
          },
        ],
      };

      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        { productId: "prod123" },
        session,
      );
      expect(result.eligible).toBe(true);

      const resultFail = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        { productId: "otherProd" },
        session,
      );
      expect(resultFail.eligible).toBe(false);
    });

    it("should evaluate CURRENT_CATEGORY correctly by checking product category", async () => {
      const Product = mongoose.model("Product");
      Product.session.mockResolvedValue({
        _id: "prod123",
        categoryId: "cat123",
      });

      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          {
            type: RuleType.CURRENT_CATEGORY,
            operator: RuleOperator.EQ,
            value: "cat123",
          },
        ],
      };

      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        { productId: "prod123" },
        session,
      );
      expect(result.eligible).toBe(true);
      expect(Product.findById).toHaveBeenCalledWith("prod123");
    });

    it("should fail gracefully and return false actual value for unknown RuleType", async () => {
      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          { type: "UNKNOWN_TYPE", operator: RuleOperator.EQ, value: true },
        ],
      };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(false);
      expect(result.evaluatedRules[0].actualValue).toBe(false);
    });

    it("should evaluate REGION with NOT_IN operator correctly", async () => {
      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.AND,
        rules: [
          {
            type: RuleType.REGION,
            operator: RuleOperator.NOT_IN,
            value: ["Mumbai", "Chennai"],
          }, // User is in Delhi
        ],
      };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(true);
    });

    it("should fail correctly and append correct reason when OR logic has no satisfied rules", async () => {
      const ruleSet = {
        active: true,
        logicOperator: RuleLogicOperator.OR,
        rules: [
          { type: RuleType.HYDACOINS, operator: RuleOperator.GTE, value: 1000 }, // Fails
          {
            type: RuleType.REDEEM_POINTS,
            operator: RuleOperator.GTE,
            value: 300,
          }, // Fails
        ],
      };
      const result = await ruleSetEvaluator.evaluateRuleSet(
        ruleSet,
        mockUser,
        {},
        session,
      );
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain(
        "None of the rules in the Rule Set were satisfied.",
      );
    });
  });
});

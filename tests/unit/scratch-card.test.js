const giftService = require("../../src/modules/gift/gift.service");
const redeemsService = require("../../src/modules/redeems/redeems.service");
const ScratchCardRule = require("../../src/schemas/scratch-card-rule.schema");
const AppConfig = require("../../src/schemas/app-config.schema");
const Gift = require("../../src/schemas/gift.schema");
const User = require("../../src/schemas/user.schema");
const Reward = require("../../src/schemas/reward.schema");
const Product = require("../../src/schemas/product.schema");
const Redeem = require("../../src/schemas/redeem.schema");
const { RuleSet } = require("../../src/schemas/rule-set.schema");
const ruleSetEvaluator = require("../../src/modules/rule-set/rule-set.evaluator");
const { SCRATCH_CARD_MESSAGES, SCRATCH_CARD_ERRORS } = require("../../src/constants/gift");

jest.mock("../../src/schemas/scratch-card-rule.schema");
jest.mock("../../src/schemas/app-config.schema");
jest.mock("../../src/schemas/gift.schema");
jest.mock("../../src/schemas/user.schema");
jest.mock("../../src/schemas/reward.schema");
jest.mock("../../src/schemas/product.schema");
jest.mock("../../src/schemas/contest.schema");
jest.mock("../../src/schemas/redeem.schema", () => ({
  create: jest.fn(),
  countDocuments: jest.fn(),
}));
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
  addBonusPoints: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../src/modules/referral/referral.service", () => ({
  evaluateReferralReward: jest.fn().mockResolvedValue(null),
  completeMilestone: jest.fn().mockResolvedValue(null),
}));
jest.mock("../../src/schemas/rule-set.schema", () => ({
  RuleSet: {
    findById: jest.fn(),
  },
}));
jest.mock("../../src/modules/rule-set/rule-set.evaluator", () => ({
  evaluateRuleSet: jest.fn(),
}));

describe("Scratch Card Unit Tests (Admin Config & User Eligibility / Rewards)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Admin Scratch Card Configuration", () => {
    it("should return configuration data successfully", async () => {
      AppConfig.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          scratchCardSettings: {
            enabled: true,
            probability: 80,
            selectedGiftIds: ["gift1"],
          },
        }),
      });

      Gift.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ _id: "gift1", name: "Special Gift" }]),
        }),
      });

      Gift.countDocuments.mockResolvedValue(5);

      const result = await giftService.getScratchCardConfig();
      expect(result.success).toBe(true);
      expect(result.data.enabled).toBe(true);
      expect(result.data.giftPool.length).toBe(1);
    });

    it("should return error if config document is not found", async () => {
      AppConfig.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await giftService.getScratchCardConfig();
      expect(result.success).toBe(false);
      expect(result.message).toBe(SCRATCH_CARD_ERRORS.CONFIG_NOT_FOUND);
    });
  });

  describe("Admin Scratch Card Config Update", () => {
    it("should update scratch card settings successfully", async () => {
      AppConfig.findOneAndUpdate.mockResolvedValue({
        scratchCardSettings: {
          enabled: true,
          probability: 50,
        },
      });

      const result = await giftService.updateScratchCardConfig({
        enabled: true,
        probability: 50,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe(SCRATCH_CARD_MESSAGES.CONFIG_UPDATED);
    });

    it("should reject invalid probability value (> 100)", async () => {
      const result = await giftService.updateScratchCardConfig({
        probability: 150,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe(SCRATCH_CARD_ERRORS.PROBABILITY_RANGE);
    });
  });

  describe("Admin Scratch Card Campaign Rules CRUD", () => {
    it("should create a scratch card rule with optional ruleSetId", async () => {
      const mockCreatedRule = {
        _id: "rule123",
        name: "Test Campaign",
        ruleSetId: "ruleset123",
      };

      ScratchCardRule.create.mockResolvedValue(mockCreatedRule);

      ScratchCardRule.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          ...mockCreatedRule,
          ruleSetId: { _id: "ruleset123", name: "Gold Tier Rule" },
        }),
      });

      const result = await giftService.createScratchCardRule({
        name: "Test Campaign",
        ruleSetId: "ruleset123",
        rewards: [{ rewardType: "COIN", minCoins: 10, maxCoins: 50, probability: 100 }],
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe(SCRATCH_CARD_MESSAGES.RULE_CREATED);
      expect(result.data.ruleSetId._id).toBe("ruleset123");
    });

    it("should update a scratch card rule including ruleSetId", async () => {
      const mockRuleDoc = {
        _id: "rule123",
        name: "Old Name",
        ruleSetId: null,
        save: jest.fn().mockResolvedValue(true),
      };

      ScratchCardRule.findById.mockResolvedValueOnce(mockRuleDoc);

      ScratchCardRule.findById.mockReturnValueOnce({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          _id: "rule123",
          name: "Updated Campaign",
          ruleSetId: { _id: "ruleset999", name: "VIP Rule Set" },
        }),
      });

      const result = await giftService.updateScratchCardRule("rule123", {
        name: "Updated Campaign",
        ruleSetId: "ruleset999",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe(SCRATCH_CARD_MESSAGES.RULE_UPDATED);
      expect(mockRuleDoc.ruleSetId).toBe("ruleset999");
    });

    it("should delete a scratch card rule successfully", async () => {
      ScratchCardRule.findByIdAndDelete.mockResolvedValue({ _id: "rule123" });

      const result = await giftService.deleteScratchCardRule("rule123");
      expect(result.success).toBe(true);
      expect(result.message).toBe(SCRATCH_CARD_MESSAGES.RULE_DELETED);
    });

    it("should return error when deleting non-existent scratch card rule", async () => {
      ScratchCardRule.findByIdAndDelete.mockResolvedValue(null);

      const result = await giftService.deleteScratchCardRule("nonexistent");
      expect(result.success).toBe(false);
      expect(result.message).toBe(SCRATCH_CARD_ERRORS.RULE_NOT_FOUND);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // User Side Scratch Card Matching, RuleSet Eligibility, Limits & Rewards
  // ───────────────────────────────────────────────────────────────────────────

  describe("User Side Scratch Card Matching & Eligibility", () => {
    let mockUser, mockReward, mockProduct;

    beforeEach(() => {
      mockUser = {
        _id: "user123",
        kycStatus: "APPROVED",
        failedScanAttempts: 0,
        scanBanUntil: null,
        roleId: { name: "user", pointMultiplier: 1 },
        save: jest.fn().mockResolvedValue(true),
      };

      mockReward = {
        _id: "reward123",
        productId: "product123",
        point: 100,
        active: true,
        expiresAt: new Date(Date.now() + 86400000),
        isRedeemed: false,
        save: jest.fn().mockResolvedValue(true),
      };

      mockProduct = {
        _id: "product123",
        name: "Test Pipe",
      };

      User.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockUser),
      });
      Reward.findById.mockResolvedValue(mockReward);
      Reward.findOne.mockResolvedValue(mockReward);
      Product.findById.mockResolvedValue(mockProduct);
      Redeem.create.mockImplementation(async (doc) => ({ _id: "redeem999", ...doc }));
      Redeem.countDocuments.mockResolvedValue(0);
      AppConfig.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ scratchCardSettings: { minBonusPoints: 0, maxBonusPoints: 10 } }),
      });
    });

    it("should skip campaign if user is ineligible based on RuleSet", async () => {
      const mockCampaign = {
        _id: "campRuleSet",
        active: true,
        ruleSetId: "rulesetVIP",
        rewards: [{ rewardType: "COIN", minCoins: 50, maxCoins: 100, probability: 100 }],
      };

      ScratchCardRule.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([mockCampaign]),
      });

      RuleSet.findById.mockResolvedValue({ _id: "rulesetVIP", name: "VIP Rule" });
      ruleSetEvaluator.evaluateRuleSet.mockResolvedValue({ eligible: false, reasons: ["Rank too low"] });

      await redeemsService.createRedeem({ userId: "user123", rewardId: "reward123", rewardUidCode: "UID123" });

      expect(ruleSetEvaluator.evaluateRuleSet).toHaveBeenCalled();
      // Should fallback to default config points because campaign was skipped
      expect(Redeem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scratchCardCampaignId: null,
        })
      );
    });

    it("should grant campaign if user is eligible based on RuleSet", async () => {
      const mockCampaign = {
        _id: "campRuleSet",
        active: true,
        ruleSetId: "rulesetVIP",
        rewards: [{ rewardType: "COIN", minCoins: 50, maxCoins: 100, probability: 100 }],
      };

      ScratchCardRule.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([mockCampaign]),
      });

      RuleSet.findById.mockResolvedValue({ _id: "rulesetVIP", name: "VIP Rule" });
      ruleSetEvaluator.evaluateRuleSet.mockResolvedValue({ eligible: true, reasons: [] });

      await redeemsService.createRedeem({ userId: "user123", rewardId: "reward123", rewardUidCode: "UID123" });

      expect(Redeem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scratchCardCampaignId: "campRuleSet",
          scratchCardRewardType: "POINTS",
        })
      );
      const createdArg = Redeem.create.mock.calls[0][0];
      expect(createdArg.scratchCardBonusPoints).toBeGreaterThanOrEqual(50);
      expect(createdArg.scratchCardBonusPoints).toBeLessThanOrEqual(100);
    });

    it("should skip campaign when totalScratchLimit is reached", async () => {
      const mockCampaign = {
        _id: "campTotalLimit",
        active: true,
        totalScratchLimit: 5,
        rewards: [{ rewardType: "COIN", minCoins: 20, maxCoins: 30, probability: 100 }],
      };

      ScratchCardRule.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([mockCampaign]),
      });

      // Total count = 5 (limit reached)
      Redeem.countDocuments.mockImplementation(async (query) => {
        if (query.scratchCardCampaignId === "campTotalLimit") return 5;
        return 0;
      });

      await redeemsService.createRedeem({ userId: "user123", rewardId: "reward123", rewardUidCode: "UID123" });

      expect(Redeem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scratchCardCampaignId: null,
        })
      );
    });

    it("should skip campaign when perUserScratchLimit is reached for user", async () => {
      const mockCampaign = {
        _id: "campUserLimit",
        active: true,
        perUserScratchLimit: 2,
        rewards: [{ rewardType: "COIN", minCoins: 20, maxCoins: 30, probability: 100 }],
      };

      ScratchCardRule.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([mockCampaign]),
      });

      // Per-user count for user123 = 2 (limit reached)
      Redeem.countDocuments.mockImplementation(async (query) => {
        if (query.userId === "user123" && query.scratchCardCampaignId === "campUserLimit") return 2;
        return 0;
      });

      await redeemsService.createRedeem({ userId: "user123", rewardId: "reward123", rewardUidCode: "UID123" });

      expect(Redeem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scratchCardCampaignId: null,
        })
      );
    });

    it("should award Gift when GIFT reward is selected and stock is available", async () => {
      const mockGiftItem = {
        _id: "giftGoldBar",
        name: "Gold Bar",
        active: true,
        stockQuantity: 10,
        reservedQuantity: 1,
      };

      const mockCampaign = {
        _id: "campGift",
        active: true,
        rewards: [
          {
            rewardType: "GIFT",
            giftId: "giftGoldBar",
            stockLimit: 5,
            probability: 100,
          },
        ],
      };

      ScratchCardRule.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([mockCampaign]),
      });
      Gift.findById.mockResolvedValue(mockGiftItem);
      Redeem.countDocuments.mockResolvedValue(0);

      await redeemsService.createRedeem({ userId: "user123", rewardId: "reward123", rewardUidCode: "UID123" });

      expect(Redeem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scratchCardCampaignId: "campGift",
          scratchCardRewardType: "GIFT",
          scratchCardGiftId: "giftGoldBar",
        })
      );
    });

    it("should fallback to 0 points when GIFT stockLimit is reached", async () => {
      const mockGiftItem = {
        _id: "giftGoldBar",
        name: "Gold Bar",
        active: true,
        stockQuantity: 10,
        reservedQuantity: 1,
      };

      const mockCampaign = {
        _id: "campGiftExhausted",
        active: true,
        rewards: [
          {
            rewardType: "GIFT",
            giftId: "giftGoldBar",
            stockLimit: 3,
            probability: 100,
          },
        ],
      };

      ScratchCardRule.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([mockCampaign]),
      });
      Gift.findById.mockResolvedValue(mockGiftItem);

      // Gift awarded count = 3 (stock limit 3 reached)
      Redeem.countDocuments.mockImplementation(async (query) => {
        if (query.scratchCardGiftId === "giftGoldBar") return 3;
        return 0;
      });

      await redeemsService.createRedeem({ userId: "user123", rewardId: "reward123", rewardUidCode: "UID123" });

      expect(Redeem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scratchCardCampaignId: "campGiftExhausted",
          scratchCardRewardType: "POINTS",
          scratchCardBonusPoints: 0,
          scratchCardGiftId: null,
        })
      );
    });
  });
});

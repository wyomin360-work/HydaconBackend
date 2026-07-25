const scratchCardsService = require("../scratch-cards.service");
const ScratchCard = require("../../../schemas/scratch-card.schema");
const rewardsService = require("../../rewards/rewards.service");
const {
  SCRATCH_CARD_STATUS,
  SCRATCH_CARD_REWARD_TYPE,
  SCRATCH_CARD_ERRORS,
  SCRATCH_CARD_MESSAGES,
  SCRATCH_CARD_TITLES,
} = require("../../../constants/scratch-cards");
const { REWARD_CAUSE } = require("../../../constants/gift");

jest.mock("../../../schemas/scratch-card.schema");
jest.mock("../../rewards/rewards.service");

describe("Scratch Cards Service Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("listScratchCards", () => {
    it("should return paginated scratch cards list with parsed parameters", async () => {
      const mockCards = [
        { _id: "card123", userId: "user123", rewardType: "POINTS" },
      ];
      ScratchCard.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockCards),
      });
      ScratchCard.countDocuments.mockResolvedValue(1);

      const result = await scratchCardsService.listScratchCards({
        userId: "user123",
        page: 1,
        limit: 15,
      });

      expect(ScratchCard.find).toHaveBeenCalledWith({ userId: "user123" });
      expect(result.data.scratchCards[0].id).toBe("card123");
      expect(result.data.total).toBe(1);
    });

    it("should compute effective points from redeemId if card.points is 0", async () => {
      const mockCards = [
        {
          _id: "card456",
          userId: "user123",
          rewardType: "POINTS",
          points: 0,
          redeemId: {
            _id: "redeem456",
            scratchCardBonusPoints: 0,
            weightedPoints: 100,
          },
        },
      ];
      ScratchCard.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockCards),
      });
      ScratchCard.countDocuments.mockResolvedValue(1);

      const result = await scratchCardsService.listScratchCards({
        userId: "user123",
        page: 1,
        limit: 15,
      });

      expect(result.data.scratchCards[0].points).toBe(100);
    });
  });

  describe("scratchCard", () => {
    it("should throw 404 error if card is not found", async () => {
      ScratchCard.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null),
      });

      await expect(
        scratchCardsService.scratchCard("invalidId", "user123"),
      ).rejects.toThrow(SCRATCH_CARD_ERRORS.NOT_FOUND);
    });

    it("should throw 403 error if user does not own the card", async () => {
      const mockCard = {
        _id: "card123",
        userId: "otherUser",
      };
      ScratchCard.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockCard),
      });

      await expect(
        scratchCardsService.scratchCard("card123", "user123"),
      ).rejects.toThrow(SCRATCH_CARD_ERRORS.UNAUTHORIZED);
    });

    it("should throw 400 error if card is already scratched", async () => {
      const mockCard = {
        _id: "card123",
        userId: "user123",
        status: SCRATCH_CARD_STATUS.SCRATCHED,
      };
      ScratchCard.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockCard),
      });

      await expect(
        scratchCardsService.scratchCard("card123", "user123"),
      ).rejects.toThrow(SCRATCH_CARD_ERRORS.ALREADY_SCRATCHED);
    });

    it("should scratch card and award points if reward type is POINTS", async () => {
      const mockCard = {
        _id: "card123",
        userId: "user123",
        status: SCRATCH_CARD_STATUS.UNSCRATCHED,
        rewardType: SCRATCH_CARD_REWARD_TYPE.POINTS,
        points: 100,
        redeemId: { _id: "redeem123", scratchCardCampaignId: "campaign123" },
        save: jest.fn().mockResolvedValue(true),
      };
      ScratchCard.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockCard),
      });
      rewardsService.awardRewardToUser.mockResolvedValue({ success: true });

      const result = await scratchCardsService.scratchCard(
        "card123",
        "user123",
      );

      expect(mockCard.status).toBe(SCRATCH_CARD_STATUS.SCRATCHED);
      expect(mockCard.save).toHaveBeenCalled();
      expect(rewardsService.awardRewardToUser).toHaveBeenCalledWith(
        "user123",
        { type: SCRATCH_CARD_REWARD_TYPE.POINTS, amount: 100 },
        {
          cause: REWARD_CAUSE.SCRATCH_CARD,
          causeId: "campaign123",
          causeTitle: SCRATCH_CARD_TITLES.BONUS_POINTS,
          referenceId: "redeem123",
        },
      );
      expect(result.message).toBe(SCRATCH_CARD_MESSAGES.SCRATCH_SUCCESS);
    });
  });
});

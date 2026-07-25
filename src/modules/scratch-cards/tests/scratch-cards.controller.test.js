const scratchCardsController = require("../scratch-cards.controller");
const scratchCardsService = require("../scratch-cards.service");
const { ROLES } = require("../../../constants/common");

jest.mock("../scratch-cards.service");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("Scratch Cards Controller Unit Tests", () => {
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    res = mockRes();
  });

  describe("listScratchCards", () => {
    it("should allow admin to specify userId in request body", async () => {
      const req = {
        role: ROLES.ADMIN,
        body: { userId: "user123", page: "2", limit: "10" },
        userId: "admin123",
      };
      scratchCardsService.listScratchCards.mockResolvedValue({
        data: { scratchCards: [], page: 2, limit: 10 },
      });

      await scratchCardsController.listScratchCards(req, res);

      expect(scratchCardsService.listScratchCards).toHaveBeenCalledWith({
        userId: "user123",
        page: 2,
        limit: 10,
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should enforce standard user token identity and restrict target userId", async () => {
      const req = {
        role: ROLES.USER,
        body: { userId: "someOtherUser", page: "1", limit: "5" },
        userId: "user123",
      };
      scratchCardsService.listScratchCards.mockResolvedValue({
        data: { scratchCards: [], page: 1, limit: 5 },
      });

      await scratchCardsController.listScratchCards(req, res);

      expect(scratchCardsService.listScratchCards).toHaveBeenCalledWith({
        userId: "user123", // should be standard user's own ID
        page: 1,
        limit: 5,
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("scratchCard", () => {
    it("should extract path param id and delegate to service", async () => {
      const req = {
        params: { id: "card123" },
        userId: "user123",
      };
      scratchCardsService.scratchCard.mockResolvedValue({
        success: true,
        message: "Card scratched",
      });

      await scratchCardsController.scratchCard(req, res);

      expect(scratchCardsService.scratchCard).toHaveBeenCalledWith("card123", "user123");
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});

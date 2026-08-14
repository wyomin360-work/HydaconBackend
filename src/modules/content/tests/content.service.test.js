const contentService = require("../content.service");
const Content = require("../../../schemas/content.schema");
const User = require("../../../schemas/user.schema");
const { RuleSet } = require("../../../schemas/rule-set.schema");
const ruleSetEvaluator = require("../../rule-set/rule-set.evaluator");

jest.mock("../../../schemas/content.schema");
jest.mock("../../../schemas/user.schema");
jest.mock("../../../schemas/role.schema");
jest.mock("../../../schemas/rule-set.schema", () => ({
  RuleSet: {
    findById: jest.fn(),
  },
}));
jest.mock("../../rule-set/rule-set.evaluator");

describe("Content Service - RuleSet Filtering Optimization", () => {
  afterEach(() => {
    jest.clearAllMocks();
    contentService.invalidateContentCache();
  });

  it("should filter out content with ruleSetId when user is null (guest)", async () => {
    const mockContents = [
      { _id: "c1", placements: ["HOME_BANNER"], ruleSetId: null },
      { _id: "c2", placements: ["HOME_BANNER"], ruleSetId: "ruleSet1" },
    ];

    const populateMock = jest.fn().mockReturnThis();
    const sortMock = jest.fn().mockReturnThis();
    const leanMock = jest.fn().mockResolvedValue(mockContents);

    Content.find.mockReturnValue({
      populate: populateMock,
      sort: sortMock,
      lean: leanMock,
    });

    const result = await contentService.getHomepageContent(null);

    expect(result.HOME_BANNER).toHaveLength(1);
    expect(result.HOME_BANNER[0]._id).toBe("c1");
    expect(User.findById).not.toHaveBeenCalled();
  });

  it("should evaluate pre-populated ruleSetId objects in parallel for authenticated users", async () => {
    const mockUser = {
      _id: "user1",
      roleId: { name: "MASON" },
      viewedPopups: [],
    };

    const mockRuleSetObj = {
      _id: "rs1",
      rules: [{ type: "USER_ROLE", value: "MASON" }],
    };

    const mockContents = [
      { _id: "c1", placements: ["HOME_BANNER"], ruleSetId: null },
      { _id: "c2", placements: ["HOME_BANNER"], ruleSetId: mockRuleSetObj },
    ];

    User.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockUser),
    });

    Content.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockContents),
    });

    ruleSetEvaluator.evaluateRuleSet.mockResolvedValue({ eligible: true });

    const result = await contentService.getHomepageContent("user1");

    expect(result.HOME_BANNER).toHaveLength(2);
    expect(ruleSetEvaluator.evaluateRuleSet).toHaveBeenCalledTimes(1);
    expect(ruleSetEvaluator.evaluateRuleSet).toHaveBeenCalledWith(
      mockRuleSetObj,
      expect.objectContaining({ _id: "user1" }),
      { targetId: "c2" },
    );
  });
});

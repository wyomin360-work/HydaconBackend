const ruleSetService = require("../../src/modules/rule-set/rule-set.service");
const { RuleSet } = require("../../src/schemas/rule-set.schema");
const mongoose = require("mongoose");
const AppError = require("../../src/utils/appError");

jest.mock("../../src/schemas/rule-set.schema");

describe("Rule Set Service Tests", () => {
  let mockRuleSet, mockAdminId;

  const mockQuery = (result) => {
    const query = Promise.resolve(result);
    query.populate = jest.fn().mockReturnValue(query);
    query.sort = jest.fn().mockReturnValue(query);
    query.skip = jest.fn().mockReturnValue(query);
    query.limit = jest.fn().mockReturnValue(query);
    query.lean = jest.fn().mockResolvedValue(result);
    return query;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockAdminId = new mongoose.Types.ObjectId().toString();

    mockRuleSet = {
      _id: "ruleset123",
      name: "Welcome Scratch Card Rules",
      description: "Rules for welcoming new users",
      active: true,
      logicOperator: "AND",
      rules: [
        {
          type: "REGION",
          operator: "IN",
          value: [
            {
              locationType: "STATE",
              country: "INDIA",
              state: "KERALA",
            },
          ],
        },
      ],
      version: 1,
      createdBy: mockAdminId,
      updatedBy: mockAdminId,
      save: jest.fn().mockResolvedValue(true),
    };

    RuleSet.mockImplementation(() => mockRuleSet);
  });

  describe("createRuleSet", () => {
    it("should successfully create a new rule set", async () => {
      const data = {
        name: "Test Rules",
        logicOperator: "AND",
        rules: [],
      };

      const result = await ruleSetService.createRuleSet(data, mockAdminId);

      expect(RuleSet).toHaveBeenCalledWith({
        ...data,
        createdBy: mockAdminId,
        updatedBy: mockAdminId,
      });
      expect(mockRuleSet.save).toHaveBeenCalled();
      expect(result).toBe(mockRuleSet);
    });
  });

  describe("getRuleSets", () => {
    it("should fetch rule sets with pagination", async () => {
      RuleSet.find = jest
        .fn()
        .mockImplementation(() => mockQuery([mockRuleSet]));
      RuleSet.countDocuments = jest.fn().mockResolvedValue(1);

      const result = await ruleSetService.getRuleSets({ skip: 0, limit: 10 });

      expect(RuleSet.find).toHaveBeenCalledWith({});
      expect(RuleSet.countDocuments).toHaveBeenCalledWith({});
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe("getRuleSetById", () => {
    it("should successfully fetch a rule set by id", async () => {
      RuleSet.findById = jest
        .fn()
        .mockImplementation(() => mockQuery(mockRuleSet));

      const result = await ruleSetService.getRuleSetById("ruleset123");

      expect(RuleSet.findById).toHaveBeenCalledWith("ruleset123");
      expect(result).toBe(mockRuleSet);
    });

    it("should throw a 404 error if rule set not found", async () => {
      RuleSet.findById = jest.fn().mockImplementation(() => mockQuery(null));

      await expect(ruleSetService.getRuleSetById("invalid123")).rejects.toThrow(
        new AppError("RuleSet not found", 404),
      );
    });
  });

  describe("updateRuleSet", () => {
    it("should successfully update an existing rule set and increment version", async () => {
      RuleSet.findById = jest.fn().mockResolvedValue(mockRuleSet);

      const updateData = { name: "Updated Rules" };
      const newAdminId = new mongoose.Types.ObjectId().toString();

      const result = await ruleSetService.updateRuleSet(
        "ruleset123",
        updateData,
        newAdminId,
      );

      expect(RuleSet.findById).toHaveBeenCalledWith("ruleset123");
      expect(result.name).toBe("Updated Rules");
      expect(result.updatedBy).toBe(newAdminId);
      expect(result.version).toBe(2);
      expect(mockRuleSet.save).toHaveBeenCalled();
    });

    it("should throw a 404 error if rule set to update is not found", async () => {
      RuleSet.findById = jest.fn().mockResolvedValue(null);

      await expect(
        ruleSetService.updateRuleSet("invalid123", {}, mockAdminId),
      ).rejects.toThrow(new AppError("RuleSet not found", 404));
    });
  });

  describe("deleteRuleSet", () => {
    it("should successfully delete a rule set by id", async () => {
      RuleSet.findByIdAndDelete = jest.fn().mockResolvedValue(mockRuleSet);

      const result = await ruleSetService.deleteRuleSet("ruleset123");

      expect(RuleSet.findByIdAndDelete).toHaveBeenCalledWith("ruleset123");
      expect(result).toBe(mockRuleSet);
    });

    it("should throw a 404 error if rule set to delete is not found", async () => {
      RuleSet.findByIdAndDelete = jest.fn().mockResolvedValue(null);

      await expect(ruleSetService.deleteRuleSet("invalid123")).rejects.toThrow(
        new AppError("RuleSet not found", 404),
      );
    });
  });
});

const ruleSetService = require("./rule-set.service");
const logger = require("../../config/pino.config");
const { sendResponse } = require("../../utils/responseHandlers");

exports.createRuleSet = async (req, res, next) => {
  try {
    const adminId = req.userId; // Usually set by verification middleware
    const ruleSet = await ruleSetService.createRuleSet(req.body, adminId);
    return sendResponse(res, {
      status: 201,
      message: "Rule set created successfully",
      data: ruleSet,
    });
  } catch (error) {
    logger.error("Error in createRuleSet:", error);
    next(error);
  }
};

exports.listRuleSets = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.body;
    const skip = (page - 1) * limit;

    const { data, total } = await ruleSetService.getRuleSets({
      skip,
      limit,
      filter: {},
    });

    return sendResponse(res, {
      status: 200,
      message: "Rule sets fetched successfully",
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Error in listRuleSets:", error);
    next(error);
  }
};

exports.getRuleSetDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ruleSet = await ruleSetService.getRuleSetById(id);
    return sendResponse(res, {
      status: 200,
      message: "Rule set details fetched successfully",
      data: ruleSet,
    });
  } catch (error) {
    logger.error("Error in getRuleSetDetails:", error);
    next(error);
  }
};

exports.updateRuleSet = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.userId;
    const ruleSet = await ruleSetService.updateRuleSet(id, req.body, adminId);
    return sendResponse(res, {
      status: 200,
      message: "Rule set updated successfully",
      data: ruleSet,
    });
  } catch (error) {
    logger.error("Error in updateRuleSet:", error);
    next(error);
  }
};

exports.deleteRuleSet = async (req, res, next) => {
  try {
    const { id } = req.params;
    await ruleSetService.deleteRuleSet(id);
    return sendResponse(res, {
      status: 200,
      message: "Rule set deleted successfully",
    });
  } catch (error) {
    logger.error("Error in deleteRuleSet:", error);
    next(error);
  }
};

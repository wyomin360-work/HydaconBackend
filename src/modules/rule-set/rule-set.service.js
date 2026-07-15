const { RuleSet } = require("../../schemas/rule-set.schema");
const AppError = require("../../utils/appError");

exports.createRuleSet = async (data, adminId) => {
  const ruleSet = new RuleSet({
    ...data,
    createdBy: adminId,
    updatedBy: adminId,
  });
  await ruleSet.save();
  return ruleSet;
};

exports.getRuleSets = async ({ skip, limit, filter }) => {
  const query = filter || {};

  const [data, total] = await Promise.all([
    RuleSet.find(query)
      .populate("createdBy", "firstName lastName email")
      .populate("updatedBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    RuleSet.countDocuments(query),
  ]);

  return { data, total };
};

exports.getRuleSetById = async (id) => {
  const ruleSet = await RuleSet.findById(id)
    .populate("createdBy", "firstName lastName email")
    .populate("updatedBy", "firstName lastName email")
    .lean();

  if (!ruleSet) {
    throw new AppError("RuleSet not found", 404);
  }

  return ruleSet;
};

exports.updateRuleSet = async (id, updateData, adminId) => {
  const ruleSet = await RuleSet.findById(id);

  if (!ruleSet) {
    throw new AppError("RuleSet not found", 404);
  }

  Object.assign(ruleSet, updateData);
  ruleSet.updatedBy = adminId;
  ruleSet.version += 1;

  await ruleSet.save();
  return ruleSet;
};

exports.deleteRuleSet = async (id) => {
  const ruleSet = await RuleSet.findByIdAndDelete(id);

  if (!ruleSet) {
    throw new AppError("RuleSet not found", 404);
  }

  return ruleSet;
};

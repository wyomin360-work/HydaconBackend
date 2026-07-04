const { RuleSet } = require("../schemas/rule-set.schema");

// Service functions for RuleSet CRUD operations

/**
 * Create a new RuleSet
 * @param {Object} data - RuleSet data
 * @param {ObjectId} adminId - ID of the admin creating the RuleSet
 */
async function createRuleSet(data, adminId) {
  const ruleSet = new RuleSet({
    ...data,
    createdBy: adminId,
    updatedBy: adminId,
  });
  return await ruleSet.save();
}

/** Retrieve a RuleSet by ID */
async function getRuleSet(id) {
  return await RuleSet.findById(id).exec();
}

/** List all RuleSets with optional filters */
async function listRuleSets(filter = {}) {
  return await RuleSet.find(filter).exec();
}

/** Update an existing RuleSet */
async function updateRuleSet(id, data, adminId) {
  return await RuleSet.findByIdAndUpdate(
    id,
    { ...data, updatedBy: adminId },
    { new: true, runValidators: true },
  ).exec();
}

/** Delete a RuleSet */
async function deleteRuleSet(id) {
  return await RuleSet.findByIdAndDelete(id).exec();
}

module.exports = {
  createRuleSet,
  getRuleSet,
  listRuleSets,
  updateRuleSet,
  deleteRuleSet,
};

const mongoose = require("mongoose");
const { RuleType, RuleScope, RuleOperator, RuleLogicOperator } = require("../../schemas/rule-set.schema");

const extractActualValue = async (rule, user, session) => {
  const { type, scope } = rule;

  switch (type) {
    case RuleType.TIER: {
      if (!user.currentTierId) return -1; // -1 rank if no tier
      const Tier = mongoose.model("Tier");
      const tier = await Tier.findById(user.currentTierId).session(session);
      return tier ? tier.rank : -1;
    }
    
    case RuleType.HYDACOINS:
      return user.hydaconCoins || 0;
      
    case RuleType.CASH_BALANCE:
      return user.cashBalance || 0;

    case RuleType.SCAN_COUNT: {
      const Redeem = mongoose.model("Redeem");
      const match = { userId: user._id };
      
      if (scope === RuleScope.MONTH) {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        match.createdAt = { $gte: startOfMonth };
      } else if (scope === RuleScope.WEEK) {
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        match.createdAt = { $gte: startOfWeek };
      }
      
      const count = await Redeem.countDocuments(match).session(session);
      return count;
    }

    case RuleType.REGION:
      return user.areaOfOperation || "";

    case RuleType.KYC_COMPLETED:
      return user.kycStatus === "APPROVED"; 

    default:
      return null;
  }
};

const applyOperator = (actualValue, operator, expectedValue) => {
  switch (operator) {
    case RuleOperator.GTE:
      return actualValue >= expectedValue;
    case RuleOperator.LTE:
      return actualValue <= expectedValue;
    case RuleOperator.EQ:
      if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
        return actualValue.trim().toLowerCase() === expectedValue.trim().toLowerCase();
      }
      return actualValue === expectedValue;
    case RuleOperator.NEQ:
      if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
        return actualValue.trim().toLowerCase() !== expectedValue.trim().toLowerCase();
      }
      return actualValue !== expectedValue;
    case RuleOperator.IN:
      if (Array.isArray(expectedValue)) {
        if (typeof actualValue === 'string') {
          return expectedValue.some(e => e.trim().toLowerCase() === actualValue.trim().toLowerCase());
        }
        return expectedValue.includes(actualValue);
      }
      return false;
    case RuleOperator.NOT_IN:
      if (Array.isArray(expectedValue)) {
        if (typeof actualValue === 'string') {
          return !expectedValue.some(e => e.trim().toLowerCase() === actualValue.trim().toLowerCase());
        }
        return !expectedValue.includes(actualValue);
      }
      return false;
    default:
      return false;
  }
};

exports.evaluateRuleSet = async (ruleSet, user, session = null) => {
  if (!ruleSet.active) {
    return { eligible: false, reasons: ["Rule set is not active"], evaluatedRules: [] };
  }

  const now = new Date();
  if (ruleSet.validFrom && now < ruleSet.validFrom) {
    return { eligible: false, reasons: ["Rule set is not yet valid"], evaluatedRules: [] };
  }
  if (ruleSet.validUntil && now > ruleSet.validUntil) {
    return { eligible: false, reasons: ["Rule set has expired"], evaluatedRules: [] };
  }

  const reasons = [];
  const evaluatedRules = [];
  let eligible = true;

  const isAnd = ruleSet.logicOperator === RuleLogicOperator.AND;
  
  if (isAnd) {
    eligible = true;
  } else {
    eligible = ruleSet.rules.length === 0 ? true : false;
  }

  for (const rule of ruleSet.rules) {
    const actualValue = await extractActualValue(rule, user, session);
    const expectedValue = rule.value; 
    const satisfied = applyOperator(actualValue, rule.operator, expectedValue);

    evaluatedRules.push({
      type: rule.type,
      scope: rule.scope,
      operator: rule.operator,
      expectedValue,
      actualValue,
      satisfied
    });

    if (!satisfied) {
      if (isAnd) {
        eligible = false;
        reasons.push(`Requirement not met for ${rule.type}`);
      }
    } else {
      if (!isAnd) {
        eligible = true;
      }
    }
  }

  if (!isAnd && !eligible && ruleSet.rules.length > 0) {
     reasons.push("None of the rules in the Rule Set were satisfied.");
  }

  return { eligible, reasons, evaluatedRules };
};

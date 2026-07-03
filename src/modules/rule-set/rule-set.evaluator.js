const mongoose = require("mongoose");
const { RuleType, RuleScope, RuleOperator, RuleLogicOperator } = require("../../schemas/rule-set.schema");

/**
 * Apply temporal scope filters to a MongoDB match query.
 * Supports MONTH, WEEK, SEASON and defaults to no date filter for
 * TOTAL, undefined, PRODUCT, CATEGORY scopes.
 * @param {Object} match - Existing query filter object.
 * @param {string} scope - RuleScope enum value.
 * @param {any} session - Mongoose session for transaction safety.
 * @returns {Object} The mutated match object.
 */
const applyScopeFilter = async (match, scope, session) => {
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
  } else if (scope === RuleScope.SEASON) {
    const LoyaltySeason = mongoose.model('LoyaltySeason');
    const activeSeason = await LoyaltySeason.findOne({ active: true }).session(session);
    if (activeSeason) {
      match.createdAt = { $gte: activeSeason.startDate, $lte: activeSeason.endDate };
    } else {
      match.createdAt = { $gte: new Date(0), $lte: new Date(0) };
    }
  }
  // TOTAL, PRODUCT, CATEGORY, or undefined – no date filter applied.
  return match;
};
const extractActualValue = async (rule, user, context, session) => {
  const { type, scope, metadata } = rule;

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

    case RuleType.REDEEM_POINTS:
      return user.totalPoints || 0;

    case RuleType.SCAN_COUNT: {
      const Redeem = mongoose.model("Redeem");
      const match = { userId: user._id };
      // Apply temporal scope filtering (MONTH/WEEK/SEASON/TOTAL)
      await applyScopeFilter(match, scope, session);
      const count = await Redeem.countDocuments(match).session(session);
      return count;
    }

    case RuleType.PRODUCT_SCAN: {
      const Redeem = mongoose.model("Redeem");
      const match = { userId: user._id };
      // Attach product filter from metadata
      if (metadata && metadata.targetProduct && metadata.targetProduct._id) {
        match.productId = metadata.targetProduct._id;
      } else if (metadata && metadata.targetId) {
        match.productId = metadata.targetId;
      }
      // Apply temporal scope filter (MONTH/WEEK/SEASON/TOTAL)
      await applyScopeFilter(match, scope, session);
      const count = await Redeem.countDocuments(match).session(session);
      return count;
    }

    case RuleType.REGION:
      return user.areaOfOperation || "";

    case RuleType.PROFILE_COMPLETED:
      return user.profileCompletionPercentage === 100;

    case RuleType.ADDRESS_COMPLETED:
      return !!user.areaOfOperation; // Placeholder until address schema is finalized

    case RuleType.KYC_COMPLETED:
      return user.kycStatus === "APPROVED"; 

    case RuleType.SEASON_POINTS:
    case RuleType.SEASON_TIER:
    case RuleType.SEASON_RANK: {
      const LoyaltySeason = mongoose.model("LoyaltySeason");
      const UserTierProgress = mongoose.model("UserTierProgress");
      const Tier = mongoose.model("Tier");

      const activeSeason = await LoyaltySeason.findOne({ active: true }).session(session);
      if (!activeSeason) return -1; // No active season

      const progress = await UserTierProgress.findOne({
        userId: user._id,
        seasonId: activeSeason._id
      }).session(session);

      if (!progress) return -1;

      if (type === RuleType.SEASON_POINTS) return progress.currentPoint || 0;

      if (!progress.currentTierId) return -1;

      if (type === RuleType.SEASON_TIER) return progress.currentTierId.toString();

      if (type === RuleType.SEASON_RANK) {
        const tier = await Tier.findById(progress.currentTierId).session(session);
        return tier ? tier.rank : -1;
      }
      
      return -1;
    }

    case RuleType.MAX_REDEMPTIONS_PER_USER: {
      if (!context.targetId) return 0;
      const GiftRedemption = mongoose.model("GiftRedemption");
      const count = await GiftRedemption.countDocuments({
        userId: user._id,
        giftId: context.targetId,
      }).session(session);
      return count;
    }

    case RuleType.MAX_GLOBAL_REDEMPTIONS: {
      if (!context.targetId) return 0;
      const GiftRedemption = mongoose.model("GiftRedemption");
      const count = await GiftRedemption.countDocuments({
        giftId: context.targetId,
      }).session(session);
      return count;
    }

    case RuleType.CATEGORY_SCAN: {
      const Redeem = mongoose.model("Redeem");
      const Product = mongoose.model("Product");
      const match = { userId: user._id };
      // Filter by target category or ID
      if (metadata && (metadata.targetCategory || metadata.targetId)) {
        const targetCatId = metadata.targetCategory ? metadata.targetCategory._id : metadata.targetId;
        const productsInCat = await Product.find({ categoryId: targetCatId }).select('_id').session(session);
        const productIds = productsInCat.map(p => p._id);
        match.productId = { $in: productIds };
      }
      // Apply temporal scope filter
      await applyScopeFilter(match, scope, session);
      const count = await Redeem.countDocuments(match).session(session);
      return count;
    }

    case RuleType.REFERRALS:
      return user.referralsCount || 0;

    case RuleType.SUCCESSFUL_REFERRALS:
      return user.successfulReferralsCount || 0;

    case RuleType.STREAK:
      return user.currentStreak || 0;

    default:
      return false;
  }
};

const applyOperator = (actualValue, operator, expectedValue) => {
  // Normalize expected boolean values sent as strings from the UI
  let parsedExpectedValue = expectedValue;
  if (typeof parsedExpectedValue === 'string') {
    if (parsedExpectedValue.toLowerCase() === 'true') parsedExpectedValue = true;
    else if (parsedExpectedValue.toLowerCase() === 'false') parsedExpectedValue = false;
  }

  // Parse numeric expected values when actual is a number
  if (typeof actualValue === 'number' && typeof parsedExpectedValue === 'string') {
    const num = Number(parsedExpectedValue);
    if (!isNaN(num)) parsedExpectedValue = num;
  }

  switch (operator) {
    case RuleOperator.GTE:
      return actualValue >= parsedExpectedValue;
    case RuleOperator.LTE:
      return actualValue <= parsedExpectedValue;
    case RuleOperator.EQ:
      if (typeof actualValue === 'string' && typeof parsedExpectedValue === 'string') {
        return actualValue.trim().toLowerCase() === parsedExpectedValue.trim().toLowerCase();
      }
      return actualValue === parsedExpectedValue;
    case RuleOperator.NEQ:
      if (typeof actualValue === 'string' && typeof parsedExpectedValue === 'string') {
        return actualValue.trim().toLowerCase() !== parsedExpectedValue.trim().toLowerCase();
      }
      return actualValue !== parsedExpectedValue;
    case RuleOperator.IN:
      if (Array.isArray(parsedExpectedValue)) {
        if (typeof actualValue === 'string') {
          const matchedString = parsedExpectedValue.some(e => typeof e === 'string' && e.trim().toLowerCase() === actualValue.trim().toLowerCase());
          if (matchedString) return true;
          return parsedExpectedValue.some(e => {
            if (e && typeof e === 'object') {
              if (e.state && e.state.trim().toLowerCase() === actualValue.trim().toLowerCase()) return true;
              if (e.country && e.country.trim().toLowerCase() === actualValue.trim().toLowerCase()) return true;
              if (e.district && e.district.trim().toLowerCase() === actualValue.trim().toLowerCase()) return true;
            }
            return false;
          });
        }
        return parsedExpectedValue.includes(actualValue);
      }
      return false;
    case RuleOperator.NOT_IN:
      if (Array.isArray(parsedExpectedValue)) {
        if (typeof actualValue === 'string') {
          const matchedString = parsedExpectedValue.some(e => typeof e === 'string' && e.trim().toLowerCase() === actualValue.trim().toLowerCase());
          if (matchedString) return false;
          const matchedObject = parsedExpectedValue.some(e => {
            if (e && typeof e === 'object') {
              if (e.state && e.state.trim().toLowerCase() === actualValue.trim().toLowerCase()) return true;
              if (e.country && e.country.trim().toLowerCase() === actualValue.trim().toLowerCase()) return true;
              if (e.district && e.district.trim().toLowerCase() === actualValue.trim().toLowerCase()) return true;
            }
            return false;
          });
          return !matchedObject;
        }
        return !parsedExpectedValue.includes(actualValue);
      }
      return false;
    default:
      return false;
  }
};

exports.evaluateRuleSet = async (ruleSet, user, context = {}, session = null) => {
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

  // Empty rule set – always eligible
  if (!ruleSet.rules || ruleSet.rules.length === 0) {
    return { eligible: true, reasons: [], evaluatedRules: [] };
  }

  const reasons = [];
  const isAnd = ruleSet.logicOperator === RuleLogicOperator.AND;
  // Initial eligibility based on logic operator
  let eligible = isAnd;

  const evaluatedRules = await Promise.all(
    ruleSet.rules.map(async (rule) => {
      const actualValue = await extractActualValue(rule, user, context, session);
      const expectedValue = rule.value; 
      const satisfied = applyOperator(actualValue, rule.operator, expectedValue);

      return {
        type: rule.type,
        scope: rule.scope,
        operator: rule.operator,
        expectedValue,
        actualValue,
        satisfied
      };
    })
  );

  // Evaluate each rule and collect reasons
  for (const evaluation of evaluatedRules) {
    if (!evaluation.satisfied) {
      if (isAnd) {
        // Preserve original error message for AND logic
        reasons.push(`Requirement not met for ${evaluation.type}`);
        eligible = false;
      } else {
        // OR logic – collect generic unsatisfied rule message
        reasons.push(`Rule not satisfied: ${evaluation.type}`);
      }
    } else {
      if (!isAnd) {
        eligible = true;
      }
    }
  }

  // If OR logic and no rule satisfied, add a generic reason
  if (!isAnd && !eligible) {
    reasons.push("None of the rules in the Rule Set were satisfied.");
  }

  return { eligible, reasons, evaluatedRules };
};

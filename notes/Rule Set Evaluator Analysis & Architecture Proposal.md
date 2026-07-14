# Rule Set Evaluator Analysis & Architecture Proposal

## 1. Analysis of Current Implementation

### Incomplete Coverage of `RuleType` (Major Bug)

The schema defines 19 different `RuleType`s (e.g., `REDEEM_POINTS`, `STREAK`, `REFERRALS`, `PRODUCT_SCAN`), but the `extractActualValue` function only handles **6 of them**.

- **The Bug:** Unhandled rules hit the `default` case and return `null`. Due to JavaScript's type coercion, comparing `null` leads to dangerous silent bugs. For example, `null >= 0` evaluates to **`true`**. If an admin creates an unimplemented rule with a target value of `0`, the evaluator will incorrectly flag it as satisfied.

### Incomplete Scope Handling

The `SCAN_COUNT` block only checks for `RuleScope.MONTH` and `RuleScope.WEEK`.

- **The Bug:** If an admin creates a rule with `RuleScope.SEASON`, `PRODUCT`, or `CATEGORY` (which are defined in the schema), the evaluator silently ignores the scope and evaluates it as `TOTAL` (because it skips the date filters entirely).

### Fragile Logic in `applyOperator` (Crash Risks)

- **`TypeError` in `IN` / `NOT_IN`:** If `actualValue` is a string but the `expectedValue` array contains numbers (e.g., `[1, 2, 3]`), the code runs `expectedValue.some(e => e.trim().toLowerCase() === ... )`. Since numbers don't have a `.trim()` method, this will throw an unhandled exception and crash the evaluation.
- **Type Coercion Issues:** The `EQ` and `NEQ` operators use strict equality (`===`) for non-strings. If the database returns `actualValue` as a string `"5"` but the admin entered `expectedValue` as a Number `5`, it will fail.
- **Missing Operators:** Your schema defines `GTE` (>=) and `LTE` (<=), but what if you need strictly greater than (`GT`) or less than (`LT`) in the future? They aren't supported in the schema or evaluator.

### Performance: The N+1 Query Problem (Architectural Drawback)

Inside the `evaluateRuleSet` function, you are evaluating rules sequentially:

```javascript
for (const rule of ruleSet.rules) {
  const actualValue = await extractActualValue(rule, user, session); // Awaits DB sequentially
  // ...
}
```

If a ruleset contains 5 rules that query the database (e.g., checking `Tier`, counting `Redeems`), it will perform 5 sequential network round-trips.

### Lack of Short-Circuiting (Performance Drawback)

- For an `AND` logic operator, if the very first rule fails, the entire ruleset will fail.
- For an `OR` logic operator, if the very first rule passes, the entire ruleset passes.
  Currently, the loop evaluates **every single rule**, executing database queries unnecessarily even after the final outcome is already known.
  _Note: If your goal is to return a complete list of `evaluatedRules` for an audit log/UI display, then avoiding short-circuiting is intentional. If not, you should `break;` early to save DB queries._

### Semantic Domain Question

Under `SCAN_COUNT`, the code queries the `Redeem` model (`Redeem.countDocuments(...)`). Usually, "scans" and "redemptions" are different events (e.g., scanning a QR code vs. redeeming the points). Make sure querying `Redeem` accurately reflects what `SCAN_COUNT` is supposed to measure in your business logic.

---

## 2. Proposed Better Architecture

To address the performance (N+1 queries), fragility, and scalability issues, the rule evaluation engine should be redesigned using a **Hydration Pattern** and an **Extensible Evaluator Pattern**.

> [!TIP]
> **Core Concept:** Separate **Data Fetching (Hydration)** from **Evaluation**. The evaluator itself should be a pure, synchronous function that accepts a fully populated user context.

### Step 1: Context Hydration

Instead of querying the DB inside the rule evaluation loop, pre-fetch all necessary data based on the rules required for evaluation.

```javascript
// Data fetcher for rule-specific requirements
const hydrateUserContext = async (user, ruleSet, session) => {
  const context = {
    hydaconCoins: user.hydaconCoins || 0,
    cashBalance: user.cashBalance || 0,
    region: user.areaOfOperation || "",
    kycCompleted: user.kycStatus === "APPROVED",
  };

  const queries = [];

  // Determine what data we need to fetch based on rules
  const needsTier = ruleSet.rules.some((r) => r.type === RuleType.TIER);
  const needsScans = ruleSet.rules.filter(
    (r) => r.type === RuleType.SCAN_COUNT,
  );

  if (needsTier && user.currentTierId) {
    queries.push(
      mongoose
        .model("Tier")
        .findById(user.currentTierId)
        .session(session)
        .then((tier) => {
          context.tierRank = tier ? tier.rank : -1;
        }),
    );
  }

  if (needsScans.length > 0) {
    const Redeem = mongoose.model("Redeem");
    // Fetch counts in parallel
    for (const rule of needsScans) {
      const match = { userId: user._id };
      // Apply date filters based on rule.scope...
      queries.push(
        Redeem.countDocuments(match)
          .session(session)
          .then((count) => {
            // Store by scope to distinguish e.g. monthly vs weekly scans
            context[`scanCount_${rule.scope}`] = count;
          }),
      );
    }
  }

  // Execute all required DB queries concurrently
  await Promise.all(queries);

  return context;
};
```

### Step 2: Pure Extractor

Extracting values is now completely synchronous and avoids side-effects. Throw errors for unsupported rules to prevent silent bugs.

```javascript
const extractActualValue = (rule, context) => {
  switch (rule.type) {
    case RuleType.TIER:
      return context.tierRank ?? -1;
    case RuleType.HYDACOINS:
      return context.hydaconCoins;
    case RuleType.CASH_BALANCE:
      return context.cashBalance;
    case RuleType.REGION:
      return context.region;
    case RuleType.KYC_COMPLETED:
      return context.kycCompleted;
    case RuleType.SCAN_COUNT:
      return context[`scanCount_${rule.scope}`] ?? 0;

    // Explicitly fail if a rule is not implemented!
    default:
      throw new Error(
        `RuleType ${rule.type} is not currently implemented in the evaluator.`,
      );
  }
};
```

### Step 3: Type-Safe Operator Logic

Ensure that types align before making comparisons, mitigating coercion bugs.

```javascript
const applyOperator = (actualValue, operator, expectedValue) => {
  // Normalize strings
  const normalize = (val) =>
    typeof val === "string" ? val.trim().toLowerCase() : val;

  const normalizedActual = normalize(actualValue);
  const normalizedExpected = normalize(expectedValue);

  switch (operator) {
    case RuleOperator.GTE:
      return actualValue >= expectedValue; // Consider type checking!
    case RuleOperator.LTE:
      return actualValue <= expectedValue;
    case RuleOperator.EQ:
      return normalizedActual === normalizedExpected;
    case RuleOperator.NEQ:
      return normalizedActual !== normalizedExpected;
    case RuleOperator.IN:
      if (!Array.isArray(expectedValue)) return false;
      return expectedValue.map(normalize).includes(normalizedActual);
    case RuleOperator.NOT_IN:
      if (!Array.isArray(expectedValue)) return false;
      return !expectedValue.map(normalize).includes(normalizedActual);
    default:
      return false;
  }
};
```

### Step 4: Short-Circuit Evaluator

Implement early exits if audit logs aren't strictly required for every single rule.

```javascript
exports.evaluateRuleSet = async (ruleSet, user, session = null) => {
  // ... check active/valid dates ...

  const isAnd = ruleSet.logicOperator === RuleLogicOperator.AND;
  const context = await hydrateUserContext(user, ruleSet, session); // Hydrate ONCE

  const evaluatedRules = [];
  const reasons = [];
  let eligible = isAnd;

  if (!isAnd && ruleSet.rules.length === 0) eligible = false;

  for (const rule of ruleSet.rules) {
    try {
      const actualValue = extractActualValue(rule, context);
      const satisfied = applyOperator(actualValue, rule.operator, rule.value);

      evaluatedRules.push({ ...rule, actualValue, satisfied });

      if (isAnd && !satisfied) {
        eligible = false;
        reasons.push(`Requirement not met for ${rule.type}`);
        break; // SHORT CIRCUIT: One failed 'AND' means the whole set fails
      } else if (!isAnd && satisfied) {
        eligible = true;
        break; // SHORT CIRCUIT: One passed 'OR' means the whole set passes
      }
    } catch (error) {
      // Log the unimplemented rule error
      reasons.push(error.message);
      eligible = false;
      if (isAnd) break;
    }
  }

  if (!isAnd && !eligible) reasons.push("None of the rules were satisfied.");

  return { eligible, reasons, evaluatedRules };
};
```

### Benefits of the Proposed Architecture:

1. **Performance:** Eliminates the N+1 query problem by fetching data concurrently (`Promise.all`).
2. **Predictability:** Fails fast and loudly on unimplemented rules rather than relying on silent type coercions.
3. **Efficiency:** Short-circuits the evaluation loop, saving processing time on complex rulesets.
4. **Testability:** By separating data fetching from evaluation, `extractActualValue` and `applyOperator` become pure functions that are trivially easy to unit test without mocking the database.

# Global RuleSet Engine Documentation

## 1. Overview & Architecture

The **Global RuleSet Engine** in `HydaconBackend` is a centralized, dynamic evaluation system designed to determine user eligibility for platform features such as gift redemptions, campaign rewards, promotions, tier benefits, and **Content Management System (CMS)** audience targeting (banners, popups, announcements, bottom sheets).

Instead of hardcoding eligibility logic across individual services, business rules are declared as **RuleSets** stored in MongoDB and evaluated dynamically against a user's context, profile, transaction history, seasonal progress, and location.

```
                  ┌────────────────────────┐
                  │    Admin / System      │
                  └───────────┬────────────┘
                              │ Declares RuleSet & Attaches to Content/Gift (JSON)
                              ▼
                  ┌────────────────────────┐
                  │   RuleSet (MongoDB)    │
                  └───────────┬────────────┘
                              │
                              ▼
┌──────────────┐  evaluateRuleSet(ruleSet, user, context, session)
│ User Request ├────────────────────────────┐
└──────────────┘                            │
                                            ▼
                              ┌───────────────────────────┐
                              │    RuleSet Evaluator      │
                              └─────────────┬─────────────┘
                                            │
                    ┌───────────────────────┴───────────────────────┐
                    ▼                                               ▼
         [Audit Mode: Concurrency]                     [Fast-Fail: Sequential]
         Evaluates all rules                           Short-circuits on fail
                    │                                               │
                    └───────────────────────┬───────────────────────┘
                                            │
                                            ▼
                              ┌───────────────────────────┐
                              │ Result:                   │
                              │ - eligible: boolean       │
                              │ - reasons: string[]       │
                              │ - evaluatedRules: [...]   │
                              └───────────────────────────┘
```

---

## 2. Content Management System (CMS) & Dynamic Audience Targeting 🎨

The RuleSet engine is integrated with the Content Management System to determine **which user sees which banner, popup, announcement, modal, or bottom sheet**.

### 2.1 CMS Integration Architecture

Every content item in the system (defined in `src/schemas/content.schema.js`) can link to a `ruleSetId`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Content Schema Item                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ - title: "Monsoon Mason Special"                                            │
│ - type: "BANNER" | "POPUP" | "ANNOUNCEMENT" | "INFORMATION_CARD"           │
│ - popupType: "MODAL_POPUP" | "FULLSCREEN" | "BOTTOM_SHEET" | "BANNER"      │
│ - placements: ["HOME_TOP", "REWARDS_SCREEN"]                                │
│ - priority / sortOrder: 10                                                  │
│ - ruleSetId: Ref("RuleSet") ───► [Targeting RuleSet Definition]              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Content Evaluation & Delivery Flow

When the mobile app or web app requests content for a specific placement (e.g. `GET /api/v1/content?placement=HOME_TOP`):

```
Client Request (User Token) ──► Content Controller
                                       │
                                       ▼
                       Fetch Active Content for Placement
                                       │
                                       ▼
                     For Each Content Item in Placement:
                    Does item have a linked `ruleSetId`?
                                 │            │
                           YES   │            │ NO
                                 ▼            ▼
                   Evaluate RuleSet        Include Item
                    (evaluateRuleSet)      (Universal Audience)
                         │          │
                 ELIGIBLE│          │INELIGIBLE
                         ▼          ▼
                    Include Item   Exclude Item
                                 │
                                 ▼
                     Sort by Priority & Return
                                 │
                                 ▼
                    Display to Targeted User
```

---

### 2.3 Use Cases & Targeting Scenarios

#### 📢 Role-Based Banners & Promotions
Show tailored promotional banners on the Home Dashboard based on user type:
- **Mason Only**: Banners offering double hydacoins for scanning bag QR codes (`USER_ROLE = MASON`).
- **Contractor Only**: Banners promoting bulk purchasing tiers (`USER_ROLE = CONTRACTOR`).

#### 🔔 Tier & Season Achievement Popups
Trigger modal popups or bottom sheets dynamically based on user loyalty rank:
- **Gold & Platinum Members Only**: Display a exclusive VIP gift popup when user's seasonal tier reaches `GOLD` (`SEASON_TIER = GOLD` or `SEASON_RANK >= 3`).

#### 📍 Regional & Location-Specific Announcements
Deliver targeted alerts based on geography:
- **State/District Specific Announcements**: Show emergency distribution announcements or regional meeting cards to users operating in `"North"` or state `"Punjab"` (`REGION IN ["Punjab", "Haryana"]`).

#### 💡 Profile & Verification Nudges
Display sticky action cards or dismissible popups to guide onboarding:
- **Unverified Users**: Show a bottom sheet urging users to submit documents if `KYC_COMPLETED = false` or `PROFILE_COMPLETED = false`.

#### 🔥 Gamification & Engagement Milestones
Congratulate and engage active users:
- **Streak Celebrations**: Display a popup card when a user reaches a 7-day scan streak (`STREAK >= 7`).
- **High Scanners**: Display exclusive reward teasers for users with over 50 scans this month (`SCAN_COUNT >= 50` with scope `MONTH`).

---

## 3. Core Schemas & Data Structure

The system schemas are defined in `src/schemas/rule-set.schema.js` and `src/schemas/content.schema.js`.

### 3.1 RuleSet Schema

A `RuleSet` is a collection of conditions grouped by a logical operator (`AND` / `OR`).

| Field | Type | Description |
| :--- | :--- | :--- |
| `name` | `String` (Required) | Human-readable identifier for the rule set. |
| `description` | `String` | Brief description of purpose/intent. |
| `active` | `Boolean` (Default: `true`) | Global toggle. Inactive rule sets immediately fail evaluation. |
| `logicOperator` | `String` (`AND` \| `OR`) | Defines how rule conditions are combined. |
| `rules` | `Rule[]` | Array of rule objects. |
| `tags` | `String[]` | Organizational metadata (e.g. `["banner", "popup", "mason"]`). |
| `version` | `Number` | Automatically incremented on updates for auditability. |
| `validFrom` | `Date` | Evaluation start timestamp (optional). |
| `validUntil` | `Date` | Expiration timestamp (optional). |

### 3.2 Rule Schema

Each rule inside a `RuleSet` contains:

```json
{
  "type": "USER_ROLE",
  "scope": "TOTAL",
  "operator": "=",
  "value": "MASON",
  "metadata": {}
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| `type` | `RuleType` (Required) | The metric or attribute being evaluated. |
| `scope` | `RuleScope` (Optional) | Temporal or categorical boundary (e.g. `WEEK`, `SEASON`, `PRODUCT`). |
| `operator` | `RuleOperator` (Required) | Comparison operator (`>=`, `<=`, `=`, `!=`, `IN`, `NOT_IN`). |
| `value` | `Mixed` (Required) | Expected value (number, string, boolean, array). |
| `metadata` | `Mixed` | Contextual parameters (e.g. `targetProduct`, `targetCategory`, `targetGift`). |

---

## 4. Evaluation Workflow & Logic

The evaluator function (`src/modules/rule-set/rule-set.evaluator.js`) processes rule sets in three main phases:

```javascript
const { eligible, reasons, evaluatedRules } = await evaluateRuleSet(
  ruleSet,
  user,
  context,
  session,
  auditMode
);
```

### 4.1 Pre-Evaluation Validity Checks
1. **Activity Check**: If `ruleSet.active === false`, evaluation immediately returns `{ eligible: false, reasons: ["Rule set is not active"] }`.
2. **Time Window Check**:
   - If `validFrom` is in the future, returns `reasons: ["Rule set is not yet valid"]`.
   - If `validUntil` is in the past, returns `reasons: ["Rule set has expired"]`.
3. **Empty RuleSet Check**: An empty `rules` array returns `{ eligible: true, reasons: [] }`.

### 4.2 Evaluation Modes
- **Audit Mode (`auditMode = true`) [Default]**: Runs all rules concurrently via `Promise.all()` to evaluate every condition. This prevents N+1 query latency while gathering full feedback/reasons on why a user failed eligibility.
- **Fast-Fail Mode (`auditMode = false`)**: Evaluates rules sequentially. With `AND` logic, it stops on the first failed rule; with `OR` logic, it stops on the first satisfied rule.

---

## 5. Rule Types & Supported Metrics

### 👤 User Profile & Role Attributes
| RuleType | Description | Evaluation Logic |
| :--- | :--- | :--- |
| `USER_ROLE` | User's role classification | Compares against `user.roleId`. Supports special string `"BOTH"` / `"ALL"`. |
| `REGION` | Geography / Area of Operation | Compares `user.areaOfOperation` against strings or location objects (`{ state, country, district }`). |
| `PROFILE_COMPLETED` | Profile completeness | Checks if `user.profileCompletionPercentage === 100`. |
| `ADDRESS_COMPLETED` | Address availability | Checks if `!!user.areaOfOperation`. |
| `KYC_COMPLETED` | KYC Verification | Checks if `user.kycStatus === "APPROVED"`. |

### 🏆 Loyalty Tiers & Seasons
| RuleType | Description | Evaluation Logic |
| :--- | :--- | :--- |
| `TIER` | General / Seasonal Tier Rank | Queries `Tier` model rank for user's `currentTierId` or active season tier. |
| `SEASON_POINTS` | Current Season Points | Queries `UserTierProgress.currentPoint` for active `LoyaltySeason`. |
| `SEASON_TIER` | Current Season Tier ID | Queries `UserTierProgress.currentTierId` for active `LoyaltySeason`. |
| `SEASON_RANK` | Current Season Tier Rank | Queries `Tier.rank` based on `UserTierProgress` in active `LoyaltySeason`. |

### 💰 Balances, Counter & Gamification
| RuleType | Description | Evaluation Logic |
| :--- | :--- | :--- |
| `HYDACOINS` | Hydacoin Wallet Balance | `user.hydaconCoins \|\| 0` |
| `CASH_BALANCE` | Cash Wallet Balance | `user.cashBalance \|\| 0` |
| `REDEEM_POINTS` | Total Point Balance | `user.totalPoints \|\| 0` |
| `REFERRALS` | Total Referral Count | `user.referralsCount \|\| 0` |
| `SUCCESSFUL_REFERRALS` | Successful Referral Count | `user.successfulReferralsCount \|\| 0` |
| `STREAK` | Activity Streak | `user.currentStreak \|\| 0` |

### 🔍 Scans & Temporal Activity
| RuleType | Description | Scope Support & Filtering |
| :--- | :--- | :--- |
| `SCAN_COUNT` | Scans / Redemptions Count | Counts `Redeem` documents filtering by `user._id` + scope date range (`MONTH`, `WEEK`, `SEASON`). |
| `PRODUCT_SCAN` | Product-specific Scans | Counts `Redeem` for `metadata.targetProduct._id` or `metadata.targetId`. |
| `CATEGORY_SCAN` | Category-specific Scans | Queries `Product` IDs under category and counts `Redeem` documents matching those IDs. |

### ⛔ Redemption Limits
| RuleType | Description | Evaluation Logic |
| :--- | :--- | :--- |
| `MAX_REDEMPTIONS_PER_USER` | Per-user Gift Redemption Cap | Counts `GiftRedemption` documents for `userId` + `giftId` (`metadata` or `context`). |
| `MAX_GLOBAL_REDEMPTIONS` | Global Gift Redemption Cap | Counts total `GiftRedemption` documents globally for `giftId`. |

---

## 6. Scope & Temporal Filtering

The evaluator includes `applyScopeFilter()` to apply temporal boundaries to query filters (`createdAt`):

| Scope (`RuleScope`) | Applied Date Boundary |
| :--- | :--- |
| `MONTH` | `createdAt >= start of current month (00:00:00)` |
| `WEEK` | `createdAt >= start of current week (Sunday 00:00:00)` |
| `SEASON` | `createdAt >= activeSeason.startDate` AND `<= activeSeason.endDate` |
| `TOTAL` / `PRODUCT` / `CATEGORY` | No date boundary applied. |

---

## 7. Operators & Normalization

Comparison behavior in `applyOperator()` handles type coercion gracefully:

- **Boolean Normalization**: String `"true"` / `"false"` (from UI forms) are converted to actual boolean values (`true`/`false`).
- **Numeric Parsing**: String numbers (e.g. `"20"`) are parsed to `Number` when comparing against numeric attributes.
- **String Case-Insensitivity**: Equal (`=`) and Not Equal (`!=`) perform trimmed, case-insensitive string comparisons.
- **Set Inclusion (`IN` / `NOT_IN`)**:
  - Compares strings against arrays of strings case-insensitively.
  - Matches string values against object properties (`state`, `country`, `district`).

---

## 8. API Endpoints (Admin Management)

RuleSets can be managed by administrators via REST endpoints registered in `src/modules/rule-set/rule-set.routes.js`:

| Method | Path | Action |
| :--- | :--- | :--- |
| `GET` | `/api/v1/rule-sets` | List all RuleSets (Supports search, pagination, active filter). |
| `POST` | `/api/v1/rule-sets` | Create a new RuleSet. |
| `GET` | `/api/v1/rule-sets/:id` | Fetch RuleSet details by ID. |
| `PUT` | `/api/v1/rule-sets/:id` | Update an existing RuleSet (increments version). |
| `DELETE` | `/api/v1/rule-sets/:id` | Delete a RuleSet. |

---

## 9. Practical Examples

### 9.1 Content Banner Audience Targeting Example (JSON)
"Display this promo banner ONLY to Gold Tier Masons in North Region":

```json
{
  "name": "Gold Mason North Banner Target",
  "description": "RuleSet for targeted promo banner on dashboard",
  "active": true,
  "logicOperator": "AND",
  "rules": [
    {
      "type": "USER_ROLE",
      "operator": "=",
      "value": "MASON"
    },
    {
      "type": "TIER",
      "operator": ">=",
      "value": 2
    },
    {
      "type": "REGION",
      "operator": "IN",
      "value": ["North", "Punjab"]
    }
  ]
}
```

### 9.2 Programmatic Content Filtering Example

```javascript
const ruleSetEvaluator = require("../rule-set/rule-set.evaluator");
const Content = require("../../schemas/content.schema");
const { RuleSet } = require("../../schemas/rule-set.schema");

async function getTargetedBanners(placement, user, session) {
  // Fetch active banners for placement
  const contents = await Content.find({
    type: "BANNER",
    placements: placement,
    active: true,
  })
    .sort({ priority: -1, sortOrder: 1 })
    .session(session);

  const eligibleBanners = [];

  for (const content of contents) {
    if (!content.ruleSetId) {
      // Universal banner (no targeting rule attached)
      eligibleBanners.push(content);
      continue;
    }

    const ruleSet = await RuleSet.findById(content.ruleSetId).session(session);
    if (!ruleSet) continue;

    const evaluation = await ruleSetEvaluator.evaluateRuleSet(
      ruleSet,
      user,
      {},
      session,
      false // Fast-fail for speedy UI response
    );

    if (evaluation.eligible) {
      eligibleBanners.push(content);
    }
  }

  return eligibleBanners;
}
```

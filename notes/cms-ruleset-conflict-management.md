# CMS RuleSet Integration & Conflict Management Guide

## 1. Overview & Goal

When displaying dynamic content—such as **Popups, Banners, Announcements, and Bottom Sheets**—on mobile or web applications, multiple content items may target the same user at the exact same time on the exact same placement (e.g. `HOME_PAGE_OPENING`).

Without proper conflict management:
- Two popups will attempt to open on top of each other, freezing or corrupting the user interface.
- Users will experience fatigue from duplicate notifications.

This document details **how RuleSets are used in CMS** and the exact **Conflict Resolution Logic** applied when new popups/banners are created or published.

---

## 2. Core Identifying Factors of a Conflict

A conflict between two CMS content items occurs ONLY when all three of the following conditions overlap:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Conflict Triangle Check                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. SAME PLACEMENT & TYPE    (e.g., Placement: HOME_PAGE_OPENING, MODAL)     │
│ 2. OVERLAPPING TIME WINDOW  (startDate <= new.endDate && endDate >= new.start)│
│ 3. OVERLAPPING AUDIENCE     (Targeting same Role / Tier / Region / Scope)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Conflict Resolution Matrix & Rules

When an administrator creates or updates a content item (e.g., a Popup), the system evaluates its targeting rules and date ranges against existing active items.

| Conflict Scenario | System Action & Priority Resolution |
| :--- | :--- |
| **Scenario A: Identical Specificity (`AND` vs `AND`)** | **Auto-Deactivate Older Item**. The newer popup supersedes the old one (`active = false`). |
| **Scenario B: Mixed Specificity (`AND` vs `OR`)** | **`AND` Takes Priority in Delivery Query**. Both can stay active, but `AND` is evaluated & served first because it is more specific. |
| **Scenario C: Universal (No RuleSet) vs Targeted/New** | **Deactivate Older Universal Item**. A targeted or newer item takes precedence over generic older content on that placement. |

---

### Detailed Breakdown of Scenarios

### Scenario A: Identical Specificity (`AND` vs `AND`)
- **Example**:
  - **Existing Popup (`MY POPUP`)**:
    - Placement: `HOME_PAGE_OPENING`
    - Date Range: July 1 – July 31
    - RuleSet: `USER_ROLE = MASON` **AND** `TIER = SILVER`
    - Status: `active = true`
  - **New Popup (`MY NEW POPUP`)**:
    - Placement: `HOME_PAGE_OPENING`
    - Date Range: July 15 – July 30 (Overlapping!)
    - RuleSet: `USER_ROLE = MASON` **AND** `TIER = SILVER`

- **Resolution Logic**:
  Because both popups target the exact same audience with strict `AND` logic during overlapping dates, displaying both will break the frontend user experience.
  - **Action**: The system automatically updates `MY POPUP` to `active = false` (or prompts admin to deactivate) and sets `MY NEW POPUP` to `active = true`.

---

### Scenario B: Mixed Specificity (`AND` vs `OR`)
- **Example**:
  - **Item 1**: RuleSet uses strict `AND` (`USER_ROLE = MASON` **AND** `TIER = SILVER`).
  - **Item 2**: RuleSet uses broad `OR` (`USER_ROLE = MASON` **OR** `TIER = SILVER`).

- **Resolution Logic**:
  `AND` logic represents a higher precision target than broad `OR` logic.
  - **Action**: Both items may remain stored in DB, but the API query orders `AND` rule sets higher in priority (`priority` boost).
  - **Delivery**: A Mason with Silver tier will be served the `AND` popup (specific offer). A Mason with Bronze tier (failing `AND` but passing `OR`) will fall back to the `OR` popup.

---

### Scenario C: Universal Content (No RuleSet attached)
- **Example**:
  - **Existing Popup**: Universal "Welcome to Hydacon" popup with **No RuleSet** (all users see it) on `HOME_PAGE_OPENING`.
  - **New Content**: A new specific Popup (or a new Universal Popup) is added for `HOME_PAGE_OPENING` during overlapping dates.

- **Resolution Logic**:
  Universal popups act as fallback content.
  - **Action**: Adding a new targeted popup (or new universal popup) automatically **deactivates the older universal popup** for that placement to prevent popup clutter.

---

## 4. Conflict Detection Algorithm (Backend Logic)

Below is the conflict detection function executed in `content.service.js` during content creation/update:

```javascript
/**
 * Checks for conflicts and deactivates older overlapping popups/banners.
 */
async function resolveCMSConflicts(newContent, session) {
  if (!newContent.active) return;

  // 1. Find active content items on the SAME placement and popupType
  const filter = {
    _id: { $ne: newContent._id },
    active: true,
    type: newContent.type, // e.g. "POPUP"
    placements: { $in: newContent.placements },
  };

  // 2. Filter for date overlaps
  if (newContent.startDate || newContent.endDate) {
    filter.$or = [
      { startDate: null, endDate: null }, // Existing item is permanent
      {
        startDate: { $lte: newContent.endDate || new Date("2099-01-01") },
        endDate: { $gte: newContent.startDate || new Date("1970-01-01") },
      },
    ];
  }

  const existingItems = await Content.find(filter)
    .populate("ruleSetId")
    .session(session);

  for (const item of existingItems) {
    const isConflict = checkAudienceConflict(newContent, item);

    if (isConflict) {
      // Deactivate older conflicting content
      item.active = false;
      await item.save({ session });
      console.log(`[CMS Conflict Resolution] Deactivated older content: "${item.title}" (${item._id}) in favor of "${newContent.title}"`);
    }
  }
}

/**
 * Evaluates audience conflict between new and existing content.
 */
function checkAudienceConflict(newContent, existingContent) {
  // Case C: If existing item has NO RuleSet (Universal), new item overrides it
  if (!existingContent.ruleSetId) return true;

  // If new content has no RuleSet and existing has no RuleSet -> Conflict
  if (!newContent.ruleSetId && !existingContent.ruleSetId) return true;

  const newRuleSet = newContent.ruleSetId;
  const existingRuleSet = existingContent.ruleSetId;

  // Case A: Both use AND logic with identical rules -> Conflict (Deactivate Old)
  if (
    newRuleSet.logicOperator === "AND" &&
    existingRuleSet.logicOperator === "AND"
  ) {
    if (areRulesEqual(newRuleSet.rules, existingRuleSet.rules)) {
      return true;
    }
  }

  return false;
}
```

---

## 5. Frontend Fail-Safe Delivery Strategy

To ensure zero UI crashes or popup overlaps on physical devices:

1. **Max 1 Popup Limit per Session/Screen**:
   The backend API (`GET /api/v1/content/active`) returns content sorted by:
   `priority DESC` ➔ `logicOperator (AND before OR)` ➔ `createdAt DESC`.
2. **Single Presentation Guarantee**:
   The Mobile App (React Native) modal manager renders **only the first eligible popup** in the returned array for `HOME_PAGE_OPENING`.

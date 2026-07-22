# Codebase Audit Notes

> This file tracks the results of guidelines compliance audits. Update after each audit pass.
> **Last audited**: 2026-07-22

---

## Audit: All Modules vs. project-rules.md

### Overall Status

| Module | §1 Structure | §2 Routes | §3 Validation | §4 No Hardcoding | §5 Swagger | §6 Responses | §7 Performance | §8 Tests |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| admin | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ❌ |
| app | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ⚠️ | ❌ |
| audit-log | ⚠️ | N/A | N/A | ✅ | ❌ | ✅ | ⚠️ | ✅ |
| campaigns | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ⚠️ | ❌ |
| common | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ⚠️ | ❌ |
| content | ✅ | ✅ | ✅ | ⚠️ | ❌ | ✅ | ⚠️ | ❌ |
| contests | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ |
| document | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ❌ |
| **events** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| files | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | N/A | ❌ |
| gift | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ⚠️ | ✅ |
| kyc | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ✅ |
| loyalty | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| products | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ❌ |
| redeems | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ❌ |
| referral | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ✅ |
| rewards | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ❌ |
| roles | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ❌ |
| rule-set | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ |
| transactions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ |
| user | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ❌ |
| videos | ✅ | ✅ | ✅ | ⚠️ | ❌ | ✅ | ⚠️ | ✅ |

**Legend**: ✅ Compliant · ⚠️ Minor Issues · ❌ Violation · N/A Not Applicable  
**Reference module (fully compliant)**: `events`

---

## 🔴 High Priority — Active Violations

### 1. Hardcoded FCM Payload `type` Strings

These services pass raw hardcoded string literals into FCM notification payloads instead of importing from constants:

| File | Hardcoded Value | Should Be |
| :--- | :--- | :--- |
| `referral/referral.service.js:309,328` | `"REFERRAL_MILESTONE"` | Constant in `src/constants/referrals.js` |
| `contests/contests.service.js:170` | `"CONTEST_WON"` | Constant in `src/constants/contests.js` |
| `gift/gift.service.js:347` | `"voucher_redeemed"` | Constant in `src/constants/gift.js` |

### 2. Write Endpoints Missing `validateRequest` Middleware

These modules have POST / PATCH routes with no AJV body validation at all:

| Module | Unvalidated Routes |
| :--- | :--- |
| `campaigns` | `POST adminCreate`, `PATCH adminUpdate` |
| `contests` | `POST adminCreate`, `PATCH adminUpdate`, `POST adminFinalise`, `POST userClaimReward` |
| `referral` | `POST /reminder`, `POST /milestone` |
| `kyc` | All mutation endpoints |
| `app` | All mutation endpoints |
| `common` | All mutation endpoints |
| `files` | All mutation endpoints |
| `loyalty` | All mutation endpoints |

### 3. Hardcoded Error / Success Messages in Service Files

These services use raw string literals instead of a constants file (§4):

| File | Examples |
| :--- | :--- |
| `user/user.service.js` | `"User not found"` (20+ places), `"Invalid Data"`, `"Invalid ifscCode"` |
| `admin/admin.service.js` | `"Registration successful"`, `"Invalid Data"`, `"Invalid or expired reset token"` |
| `kyc/kyc.service.js` | `"User not found"`, `"Cannot approve KYC…"`, `"Cannot reject KYC…"` |
| `referral/referral.service.js` | `"User not found"`, `"Invalid milestone key"`, `"User was not referred by anyone"` |

---

## 🟡 Medium Priority — Quality Gaps

### 4. Missing Swagger Documentation Files

| Module | Missing File |
| :--- | :--- |
| campaigns | `src/docs/campaigns.doc.js` |
| content | `src/docs/content.doc.js` |
| contests | `src/docs/contests.doc.js` |
| files | `src/docs/files.doc.js` |
| gift | `src/docs/gift.doc.js` |
| kyc | `src/docs/kyc.doc.js` |
| loyalty | `src/docs/loyalty.doc.js` |
| referral | `src/docs/referral.doc.js` |
| videos | `src/docs/videos.doc.js` |
| audit-log | `src/docs/audit-log.doc.js` |

### 5. Missing Constants Files

| Module | Missing File |
| :--- | :--- |
| campaigns | `src/constants/campaigns.js` |
| contests | `src/constants/contests.js` |
| kyc | `src/constants/kyc.js` |
| app | `src/constants/app.js` |
| videos | `src/constants/videos.js` |

### 6. No Unit Tests

| Module | Priority |
| :--- | :--- |
| user | 🔴 High |
| admin | 🔴 High |
| transactions | 🔴 High |
| redeems | 🔴 High |
| products | 🟡 Medium |
| rewards | 🟡 Medium |
| contests | 🟡 Medium |
| content | 🟡 Medium |
| campaigns | 🟡 Medium |
| document | 🟢 Low |
| roles | 🟢 Low |
| common | 🟢 Low |
| files | 🟢 Low |
| app | 🟢 Low |

---

## 🟢 Low Priority — Minor Issues

### 7. `.lean()` Missing on Read-Only Queries

`.lean()` should be appended to all `find`, `findOne`, and `findById` calls that are only reading data (not mutating). Affected files:

- `content/content.service.js` — `Content.find(...)`, `Content.findById(...)`
- `roles/role.service.js` — `Role.find(...)`, `Role.findOne(...)`, `Role.findById(...)`
- `kyc/kyc.service.js` — `User.findById(...)`, `User.find(...)`
- `admin/admin.service.js` — `Admin.findOne(...)`, `Admin.findById(...)`, `User.find(...)`
- `user/user.service.js` — most `User.findById(...)` and `ServiceRequest.findOne(...)` calls
- `referral/referral.service.js` — `User.find(...)`, `User.findById(...)`
- `products/product.service.js` — `Product.findById(...)`, `Product.find(...)`

> Note: Do NOT add `.lean()` to queries that call `.save()` on the result — those need Mongoose document instances.

### 8. `referral.routes.js` — Hardcoded Path Strings

`referral.routes.js` uses inline raw strings (`"/my-referrals"`, `"/stats"`, `"/list"`, `"/reminder"`, `"/milestone"`) instead of a `referral.paths.js` constants file. Violates §1 and §2.

### 9. `gift.service.js` — Manual String Replace Instead of `formatNotification`

`gift.service.js:345` uses `.replace("{{giftName}}", gift.name)` manually. Should use `formatNotification(template, { giftName: gift.name })` from `src/utils/heplers.js`.

---

## Completed Work (Do Not Re-Do)

- ✅ `events` module — fully refactored and compliant (all 8 sections)
- ✅ `notifications.js` — centralized FCM templates for events, referral, contests, loyalty, kyc, withdraw, gifts
- ✅ `referral.service.js` — FCM notification strings moved to `APP_NOTIFICATIONS`
- ✅ `contests.service.js` — FCM notification title/body moved to `APP_NOTIFICATIONS`
- ✅ `src/constants/events.js` — created with all event enums, messages, errors, and config
- ✅ `src/validations/events.validations.js` — created AJV schemas for event create/update/invite
- ✅ `src/docs/events.doc.js` — created Swagger docs for all 12 event endpoints
- ✅ `guidelines/project-rules.md` — added §4 (hardcoding), §6 (responses), §7 (performance), §8 (testing)
- ✅ `scratch card` module — fully refactored and compliant:
  - Added `scratchCardConfigUpdateRequestType`, `scratchCardRuleCreateRequestType`, `scratchCardRuleUpdateRequestType` in `src/validations/gift.validations.js`
  - Attached `validateRequest` middleware to all scratch card mutation endpoints in `src/modules/gift/gift.routes.js`
  - Centralized scratch card constants, messages, and errors in `src/constants/gift.js`
  - Replaced all raw hardcoded message strings in `gift.service.js` with constants
  - Integrated `RuleSet` eligibility evaluation (`evaluateRuleSet`) for scratch card campaigns in `src/modules/redeems/redeems.service.js`
  - Created unit test suite `tests/unit/scratch-card.test.js` (all 50 unit tests passing)

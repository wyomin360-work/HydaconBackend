# Coverage Calculation Logic Review

**Date:** 2026-07-11  
**Files Reviewed:**
- `src/modules/products/product.calculation.js`
- `src/modules/products/product.service.js`
- `HydaconWeb/src/sections/calculator/view/calculator-view.tsx`
- `HydaconWeb/src/services/coverageService.ts`

---

## Overview

Overall, the logic is **architecturally sound and functionally correct**, but there are a few **notable issues and design concerns** worth flagging.

---

## ✅ What's Correct

### Standard Area Strategy (`AREA` type)

The formula is straightforward and correct:

```
areaConverted  → convert input to the product's configured coverageUnit (sqft/sqm)
totalArea      = areaConverted × (1 + wastage%)
unitsRequired  = totalArea / coveragePerUnit
bagsRequired   = ceil(unitsRequired)   ← always rounds UP
```

This is the standard industry approach. ✅

### Joint Filler Strategy (`JOINT_FILLER` type)

The core formula used is the **standard tile grout coverage formula**:

```
Rate (kg/m²) = ((L + W) / (L × W)) × Thickness × JointWidth × Density
```

This is the correct industry formula. For a 600×600×10mm tile with 3mm joint and density 1.96:

```
Rate = ((600+600)/(600×600)) × 10 × 3 × 1.96
     = (1200/360000) × 58.8
     = 0.003333 × 58.8
     ≈ 0.196 kg/m²
```

That is a realistic grout consumption rate — however, the **unit handling** introduces a critical scaling issue (see Bug #1 below). ✅ Formula structure is correct, ❌ unit normalization is missing.

---

## ⚠️ Bugs & Issues Found

### Bug #1 — Unit Mismatch in Joint Filler Formula (🔴 Critical)

**File:** `src/modules/products/product.calculation.js` — Line 140

**Problem:**

The tile dimensions (`tileLength`, `tileWidth`, `tileThickness`, `jointWidth`) are passed in **millimeters** from the UI. The formula's result is `kg/m²` only if the unit scaling is accounted for. A dimensional analysis shows the current code is missing a `/1000` scale factor:

```
Dimensional breakdown with mm inputs:
  [(mm + mm) / (mm × mm)] × mm × mm × (kg/L)
= [1/mm] × mm² × (kg/L)
= mm × kg/L
```

Since `1 L = 1,000,000 mm³` and `1 m² = 1,000,000 mm²`, converting `mm × kg/L` to `kg/m²` requires dividing by **1000**. The current code omits this factor, making results **1000× too large**.

**Example Impact:**
- 600×600×10mm tile, 3mm joint, 100 sqm area
- Current code outputs: ~19,600 kg of grout required ❌
- Correct result: ~19.6 kg of grout required ✅

**Current code (incorrect):**
```js
const rateKgPerSqm =
  ((tileLength + tileWidth) / (tileLength * tileWidth))
  * tileThickness * jointWidth * density;
```

**Fix:**
```js
// All dimensions in mm, density in kg/L (= kg/dm³)
// Dividing by 1000 normalizes mm-based joint volume to kg/m²
const rateKgPerSqm =
  ((tileLength + tileWidth) / (tileLength * tileWidth))
  * tileThickness * jointWidth * density / 1000;
```

---

### Bug #2 — `calculatedWeightKg` computed but not returned in `StandardAreaStrategy` (🟡 Minor)

**File:** `src/modules/products/product.calculation.js` — Line 39

```js
const calculatedWeightKg = bagsRequired * packageWeight; // ← computed but NOT in return object
```

The frontend then falls back to a client-side calculation:

```tsx
// calculator-view.tsx ~L601
`${res.unitsRequired * product.packWeight} kg`
```

This is inconsistent — the `JOINT_FILLER` strategy correctly returns `materialRequired` in the response, but the `AREA` strategy does not. The backend should return the calculated weight for both strategies to keep the API response symmetric.

**Fix:** Add `materialRequired` to the `StandardAreaStrategy` return object:
```js
return {
  // ... existing fields
  materialRequired: `${calculatedWeightKg} kg`,
};
```

---

### Bug #3 — Frontend uses `product.packWeight` but backend field is `packageWeight` (🟠 Medium)

**File:** `HydaconWeb/src/sections/calculator/view/calculator-view.tsx` — ~Line 601

```tsx
`${res.unitsRequired * product.packWeight} kg`
```

The backend schema and API response use `packageWeight` (inside `coverage.packageWeight`), not a top-level `packWeight` field. Unless the frontend `Product` type explicitly maps this to `packWeight`, this expression will render as `NaN kg` for AREA-type products.

**Fix options:**
1. Use `product.coverage?.packageWeight` on the frontend, or
2. Have the backend always return `materialRequired` (which removes the need for the client to compute it at all — see Bug #2 fix above).

---

### Note #4 — Minimum Bag Floor Could Silently Mislead on Small Areas (🟢 Info)

```js
if (request.area > 0 && bagsRequired < 1) {
  bagsRequired = 1;
}
```

This is intentional (you can't order 0 bags), but there is no flag in `calculationNotes` to warn the user that the area is very small and the estimate has been floored to 1 bag. A minor UX improvement would be to include that in the note string.

---

## 📋 Summary Table

| # | Issue | Severity | File | Line |
|---|-------|----------|------|------|
| 1 | Joint filler formula missing `/1000` scaling factor — results are 1000× too large | 🔴 Critical | `product.calculation.js` | L140 |
| 2 | `calculatedWeightKg` computed but not returned in AREA strategy response | 🟡 Minor | `product.calculation.js` | L39 |
| 3 | Frontend uses `product.packWeight` but backend field is `coverage.packageWeight` | 🟠 Medium | `calculator-view.tsx` | ~L601 |
| 4 | Minimum bag floor (1) not surfaced in `calculationNotes` to the user | 🟢 Info | `product.calculation.js` | L34, L153 |

---

## Recommended Fix Priority

1. **Fix Bug #1 immediately** — the `/1000` omission makes joint filler calculations completely wrong in production.
2. **Fix Bug #3** — `NaN kg` rendering is a visible UI bug for AREA products.
3. **Fix Bug #2** — Return `materialRequired` from both strategies for API symmetry.
4. **Note #4** — Low priority UX polish.

# Mongoose Schema Rules & Design Guidelines

This document outlines the standard guidelines for designing and maintaining Mongoose schemas in the Hydacon Backend codebase. Both developers and AI agents must adhere to these rules when creating or modifying database schemas.

---

## 1. Extract Nested Structures into Sub-schemas

To ensure code readability, reusability, and maintenance, any nested objects containing more than a couple of simple fields should be extracted into their own sub-schemas rather than being defined inline.

### Example:

**❌ Avoid Inline Definitions:**

```javascript
const userSchema = new mongoose.Schema({
  bankDetails: {
    accountNumber: { type: String },
    userName: { type: String },
    ifscCode: { type: String },
  },
});
```

**✅ Use Explicit Sub-schemas:**

```javascript
const bankDetailsSchema = new mongoose.Schema(
  {
    accountNumber: { type: String },
    userName: { type: String },
    ifscCode: { type: String },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema({
  bankDetails: {
    type: bankDetailsSchema,
    default: () => ({}),
  },
});
```

---

## 2. Disable Subdocument IDs (`_id: false`)

By default, Mongoose automatically adds an `_id` field to every subdocument.

- For nested configuration, address, status, or details objects that do not need unique database identifiers, **always** specify `{ _id: false }` in the sub-schema options.
- Only leave `_id` enabled if the subdocument must be individually queried, referenced, or mutated using its ID.

---

## 3. Consistent Default Initialization

When referencing a sub-schema in a parent document, use a default factory function to ensure that Mongoose initializes the object field by default:

```javascript
myField: {
  type: mySubSchema,
  default: () => ({})
}
```

This prevents issues where deep fields are read as `undefined` at runtime.

---

## 4. Reusability Across Schemas

If a nested structure (e.g. `bankDetailsSchema`) is used in multiple primary schemas (e.g. `userSchema` and `transactionSchema`), extract it or duplicate it clearly while keeping the field signatures identical.

---

## 5. Naming Conventions

- Sub-schemas should use the `camelCase` naming convention ending with `Schema` (e.g., `bankDetailsSchema`, `locationSchema`).
- Primary schemas should match the model name (e.g., `userSchema` for the `User` model).

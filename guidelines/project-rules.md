# Hydacon Backend Project Guidelines & Rules

This document outlines the architectural patterns, directory structures, route access rules, and coding standards that must be followed by all developers and AI agents working on this project.

---

## 1. Directory & File Structure

The project uses a structured, modular design where logic is partitioned based on features and responsibility.

- **`src/config/`**: Global configuration files (e.g., DB connections, firebase setups).
- **`src/constants/`**: Application-wide enums and static definitions.
- **`src/docs/`**: Swagger OpenApi path specification files.
- **`src/middlewares/`**: Custom Express middlewares (e.g., authentication, error handling, input validation).
- **`src/modules/`**: Feature-based directory modules containing controller and service logic.
- **`src/routes/`**: Central route registration (`global.routes.js`).
- **`src/schemas/`**: Mongoose model schemas.
- **`src/validations/`**: AJV JSON validation schemas.

### Module Directory Pattern
Every new feature or business domain must be added under `src/modules/<feature-name>/`. A standard module should consist of:
1. **`<feature>.paths.js`**: Contains path mapping constants (no hardcoded path strings inside routing files).
2. **`<feature>.routes.js`**: Defines the Express router mapping endpoints to controller handlers.
3. **`<feature>.controller.js`**: Parses requests, invokes services, and constructs HTTP responses.
4. **`<feature>.service.js`**: Contains database operations and core business rules.

---

## 2. Route Definition & Access Control

To maintain consistency and secure route handling:

- **Centralized Paths**: Route paths must always be referenced from the module's `.paths.js` file. Do not use raw strings like `/api/v1/user/profile` inside `.routes.js` or controllers.
- **Access Control Middlewares**: Secure endpoints must apply the appropriate middleware imported from `src/middlewares/jwtVerification.js`:
  - `verifyUser`: For endpoints accessible to regular authenticated users.
  - `verifyAdmin`: For admin-only features.
- **Error Wrapping**: Always wrap asynchronous controller functions with the `handleError` helper from `src/utils/heplers.js` to ensure unhandled promise rejections are correctly caught and processed by the global error boundary.

### Example Route Definition:
```javascript
const express = require("express");
const controller = require("./user.controller");
const userPaths = require("./user.paths");
const verification = require("../../middlewares/jwtVerification");
const validateRequest = require("../../middlewares/validator");
const { userProfileUpdateRequestType } = require("../../validations/user.validations");
const { handleError } = require("../../utils/heplers");

const router = express.Router();

router.patch(
  userPaths.updateProfile,
  verification.verifyUser,
  validateRequest(userProfileUpdateRequestType),
  handleError(controller.updateProfile),
);
```

---

## 3. Strict Request Validation

Any endpoint receiving input payloads (POST, PATCH, PUT, DELETE with body) **must** validate the request body before invoking the controller logic.

- Define validation schemas in `src/validations/` using AJV format.
- Set `additionalProperties: false` to reject unrecognized fields.
- Provide descriptive `errorMessage` definitions for user-friendly validation failures.
- Apply validations using the `validateRequest` middleware.

---

## 4. Use Constants and Enums Instead of Hardcoded Text

To avoid typos and simplify system updates, never use raw hardcoded strings for statuses, types, roles, payment methods, etc.

- Define enums in `src/constants/` files (e.g., `src/constants/user.js`).
- Reference these enums in services, controllers, validations, and database schemas.
- In Mongoose schemas, restrict field inputs using these enums:
  ```javascript
  status: {
    type: String,
    enum: Object.values(KYC_DOCUMENT_STATUS),
    default: KYC_DOCUMENT_STATUS.PENDING,
  }
  ```

---

## 5. API Documentation

To ensure documentation matches the actual codebase:
- Every new API route or payload alteration **must** be accompanied by an update to the corresponding Swagger documentation file inside `src/docs/`.
- Ensure headers, query parameters, request body schemas, and possible HTTP status response codes (e.g., `200`, `400`, `401`, `403`, `404`) are defined clearly.

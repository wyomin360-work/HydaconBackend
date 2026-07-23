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
const {
  userProfileUpdateRequestType,
} = require("../../validations/user.validations");
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

## 4. Strict Elimination of Hardcoded Values & Push Notifications

To maintain consistency, prevent typos, and simplify global maintenance, **never use raw hardcoded values or hardcoded notification strings in business logic or database schemas**.

### A. Constants, Enums & Magic Numbers
- **No Hardcoded Strings/Numbers**: Do not hardcode status strings, event types, tab names, error messages, success responses, query limits, distance radiuses, or time intervals inside `.service.js`, `.controller.js`, or schema files.
- **Centralized Constants**: All application-wide enums, constants, messages, and configuration limits must be defined in `src/constants/` files (e.g., `src/constants/events.js`, `src/constants/user.js`, `src/constants/common.js`).
- **Mongoose Schema Enums**: In Mongoose schemas, restrict field inputs using imported constant enum arrays:
  ```javascript
  status: {
    type: String,
    enum: Object.values(EVENT_STATUS),
    default: EVENT_STATUS.UPCOMING,
  }
  ```

### B. FCM Push Notifications
- **No Hardcoded Notification Texts**: Never hardcode push notification titles, body text, or notification type strings directly inside service methods or controllers.
- **Centralized Notification Store**: All FCM notification templates (titles, bodies with `{{placeholders}}`, and type identifiers) **must** be stored inside `APP_NOTIFICATIONS` in `src/constants/notifications.js`.
- **Formatting Helper**: Use the `formatNotification(template, data)` helper from `src/utils/heplers.js` to dynamically inject parameters into notification body templates:
  ```javascript
  await sendFcmNotifications(
    user.fcmTokens,
    APP_NOTIFICATIONS.events.invitation.title,
    formatNotification(APP_NOTIFICATIONS.events.invitation.body, {
      eventTitle: event.title,
    }),
    { type: EVENT_FCM_TYPES.EVENT_INVITATION, eventId: eventId.toString() },
  );
  ```

---

## 5. API Documentation

To ensure documentation matches the actual codebase:

- Every new API route or payload alteration **must** be accompanied by an update to the corresponding Swagger documentation file inside `src/docs/`.
- Ensure headers, query parameters, request body schemas, and possible HTTP status response codes (e.g., `200`, `400`, `401`, `403`, `404`) are defined clearly.

---

## 6. Standardized Response Handling & Error Exceptions

To ensure uniform API response structures and clean control flow:

- **Controller Responses**: Controllers must format successful HTTP responses using `sendResponse(res, data, statusCode)` from `src/utils/responseHandlers.js`.
- **Service Exceptions**: Services must throw operational errors using `sendFailResponse(message, statusCode)` from `src/utils/responseHandlers.js` (which throws an `AppError`). Do not return custom error objects or interact with `res` inside service files.

---

## 7. Performance & Non-Blocking Async Operations

- **Read-Only Mongoose Queries**: Always use `.lean()` on read-only database queries (`find`, `findById`, `findOne`) to minimize Mongoose document overhead. Use `attachId(docs)` from `src/utils/heplers.js` to format clean `id` properties.
- **Non-Blocking Background Operations**: Non-critical background tasks (e.g., status syncing, push notifications, background metrics) must be executed asynchronously without `await` blocking the main HTTP response thread, and must include `.catch()` error handlers to prevent unhandled promise rejections.
- **Strict Query Parameter Parsing**: Always parse and validate numerical query parameters (e.g., `page` and `limit`) using `Math.max(1, parseInt(query.page) || 1)` to prevent string concatenation bugs during query pagination (`skip`/`limit`).

---

## 8. Unit Testing Requirements

- **Test Colocation**: To keep modules self-contained, all feature unit test suites **must** be colocated inside their respective feature module directories under a `tests/` subfolder:
  - Service tests: `src/modules/<feature>/tests/<feature>.test.js`
  - Controller tests: `src/modules/<feature>/tests/<feature>.controller.test.js`
- **Other Unit Tests**: Utility and middleware unit tests are colocated under their respective directories:
  - Middleware tests: `src/middlewares/tests/<middleware>.test.js`
  - Function tests: `src/functions/tests/<utility>.test.js`
- **Centralized Integration & Setup**: The root `/tests` directory is reserved strictly for global configurations (e.g. `tests/setup.js`) and cross-module integration or system-wide E2E tests.
- **Service Tests**: Must cover success flows, boundary conditions, error throwing (`rejects.toThrow`), capacity limits, and eligibility checks using Jest mocks (`jest.mock(...)`) for Mongoose models and third-party functions.
- **Controller Tests**: Must verify parameter extraction (req.body, req.params, req.query, req.user) and correct delegation to service methods.

---

## 9. Organized & Unified Imports

To maintain readability and prevent node application startup crashes:

- **Top-Level Imports**: All `require(...)` statements must be placed cleanly at the top of the file. Do not use inline `require(...)` statements inside functions or conditional blocks.
- **Dependency Hierarchy**: Organize imports logically:
  1. Node native modules (e.g., `path`, `fs`).
  2. Third-party dependencies (e.g., `mongoose`, `express`).
  3. Constants, schemas, and helper utilities.
  4. Relative service dependencies.
- **Acyclic Architecture**: Keep feature modules decoupled. Ensure dependencies between modules are strictly unidirectional to completely avoid circular import loops.


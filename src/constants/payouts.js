const { WITHDRAWAL_STATUS } = require("./withdrawals");

const PAYOUT_PROVIDER = Object.freeze({
  RAZORPAYX: "razorpayx",
  CASHFREE: "cashfree",
  UNKNOWN: "unknown",
});
const PAYOUT_PROVIDER_ENVIRONMENT = Object.freeze({
  SANDBOX: "sandbox",
  PRODUCTION: "production",
});

const CASHFREE_PAYOUT_STATUS = Object.freeze({
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  REJECTED: "REJECTED",
  REVERSED: "REVERSED",
  APPROVAL_PENDING: "APPROVAL_PENDING",
  RECEIVED: "RECEIVED",
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
});
const CASHFREE_PAYOUT_STATUS_CODE = Object.freeze({ COMPLETED: "COMPLETED" });
const CASHFREE_PAYOUT_EVENT = Object.freeze({
  TRANSFER_REVERSED: "TRANSFER_REVERSED",
  TRANSFER_FAILED: "TRANSFER_FAILED",
  TRANSFER_REJECTED: "TRANSFER_REJECTED",
  TRANSFER_ACKNOWLEDGED: "TRANSFER_ACKNOWLEDGED",
  TRANSFER_SUCCESS: "TRANSFER_SUCCESS",
});

const RAZORPAYX_PAYOUT_EVENT = Object.freeze({
  PROCESSED: "payout.processed",
  FAILED: "payout.failed",
  REJECTED: "payout.rejected",
  CANCELLED: "payout.cancelled",
  REVERSED: "payout.reversed",
  QUEUED: "payout.queued",
  PENDING: "payout.pending",
  INITIATED: "payout.initiated",
  UPDATED: "payout.updated",
});
const RAZORPAYX_PAYOUT_STATUS = Object.freeze({
  PROCESSED: "processed",
  REVERSED: "reversed",
  FAILED: "failed",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
});

const PAYOUT_PROVIDER_VALUES = Object.freeze([
  PAYOUT_PROVIDER.RAZORPAYX,
  PAYOUT_PROVIDER.CASHFREE,
]);
const PAYOUT_EVENT_PROVIDER_VALUES = Object.freeze([
  ...PAYOUT_PROVIDER_VALUES,
  PAYOUT_PROVIDER.UNKNOWN,
]);

const PAYOUT_OUTBOX_STATUS = Object.freeze({
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  SUBMITTED: "SUBMITTED",
  RETRY: "RETRY",
  RECONCILIATION_REQUIRED: "RECONCILIATION_REQUIRED",
  FAILED: "FAILED",
});

const PAYOUT_OUTBOX_STATUS_VALUES = Object.freeze(
  Object.values(PAYOUT_OUTBOX_STATUS),
);

const PAYOUT_ATTEMPT_OUTCOME = Object.freeze({
  REQUESTED: "REQUESTED",
  SUCCEEDED: "SUCCEEDED",
  DEFINITIVE_FAILURE: "DEFINITIVE_FAILURE",
  AMBIGUOUS_FAILURE: "AMBIGUOUS_FAILURE",
});

const PAYOUT_ATTEMPT_OUTCOME_VALUES = Object.freeze(
  Object.values(PAYOUT_ATTEMPT_OUTCOME),
);

const PAYOUT_EVENT_STATUS = Object.freeze({
  RECEIVED: "RECEIVED",
  PROCESSING: "PROCESSING",
  PROCESSED: "PROCESSED",
  IGNORED: "IGNORED",
  FAILED: "FAILED",
});

const PAYOUT_EVENT_STATUS_VALUES = Object.freeze(
  Object.values(PAYOUT_EVENT_STATUS),
);

const PAYOUT_RECON_OUTCOME = Object.freeze({
  MATCHED: "MATCHED",
  NOT_FOUND: "NOT_FOUND",
  MISMATCH: "MISMATCH",
  ERROR: "ERROR",
});

const PAYOUT_RECON_OUTCOME_VALUES = Object.freeze(
  Object.values(PAYOUT_RECON_OUTCOME),
);

const PAYOUT_SOURCE = Object.freeze({
  WEBHOOK: "WEBHOOK",
  RECONCILIATION: "RECONCILIATION",
  PAYOUT_WEBHOOK: "PAYOUT_WEBHOOK",
  PAYOUT_RECONCILIATION: "PAYOUT_RECONCILIATION",
});
const PAYOUT_DELIVERY_SOURCE_VALUES = Object.freeze([
  PAYOUT_SOURCE.WEBHOOK,
  PAYOUT_SOURCE.RECONCILIATION,
]);

const PAYOUT_CURRENCY = Object.freeze({ INR: "INR" });
const PAYOUT_TRANSFER_MODE = Object.freeze({ IMPS: "IMPS" });
const PAYOUT_ASSET = Object.freeze({
  INR: "INR",
  HYDACON_COIN: "HYDACON_COIN",
});
const PAYOUT_ASSET_VALUES = Object.freeze(Object.values(PAYOUT_ASSET));
const PAYOUT_RESULT = Object.freeze({
  SUCCESS: "success",
  IGNORED: "ignored",
  STATUS_CHECK: "status-check",
  APPLIED: (status) => `applied:${status}`,
  STALE_OR_DUPLICATE: (current, requested) =>
    `stale-or-duplicate:${current}->${requested}`,
});
const PAYOUT_HTTP_STATUS = Object.freeze({
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_SERVER_ERROR: 500,
});
const PAYOUT_TERMINAL_WITHDRAWAL_STATUSES = Object.freeze([
  WITHDRAWAL_STATUS.COMPLETED,
  WITHDRAWAL_STATUS.FAILED,
  WITHDRAWAL_STATUS.REVERSED,
  WITHDRAWAL_STATUS.CANCELLED,
]);
const PAYOUT_FAILURE_TERMINAL_STATUSES = Object.freeze([
  WITHDRAWAL_STATUS.FAILED,
  WITHDRAWAL_STATUS.REVERSED,
  WITHDRAWAL_STATUS.CANCELLED,
]);

const PAYOUT_LEDGER_MOVEMENT = Object.freeze({
  WITHDRAWAL_COIN_DEBIT: "WITHDRAWAL_COIN_DEBIT",
  WITHDRAWAL_COIN_REFUND: "WITHDRAWAL_COIN_REFUND",
  PAYOUT_COMPLETED: "PAYOUT_COMPLETED",
  PAYOUT_REVERSED: "PAYOUT_REVERSED",
});

const PAYOUT_LEDGER_MOVEMENT_VALUES = Object.freeze(
  Object.values(PAYOUT_LEDGER_MOVEMENT),
);
const PAYOUT_LEDGER_SOURCE = Object.freeze({
  USER_REQUEST: "USER_REQUEST",
  ADMIN_CANCELLATION: "ADMIN_CANCELLATION",
  PAYOUT_WEBHOOK: PAYOUT_SOURCE.PAYOUT_WEBHOOK,
  PAYOUT_RECONCILIATION: PAYOUT_SOURCE.PAYOUT_RECONCILIATION,
});
const PAYOUT_LEDGER_SOURCE_VALUES = Object.freeze(
  Object.values(PAYOUT_LEDGER_SOURCE),
);

const PAYOUT_CONFIG = Object.freeze({
  MINOR_UNITS_PER_INR: 100,
  MAX_NARRATION_LENGTH: 30,
  MAX_ERROR_LENGTH: 500,
  REDACT_DIGIT_SEQUENCE_LENGTH: 6,
  EVENT_LEASE_MS: 10 * 60 * 1000,
  OUTBOX_LEASE_MS: 2 * 60 * 1000,
  OUTBOX_BATCH_SIZE: 20,
  OUTBOX_RETRY_BASE_MS: 30 * 1000,
  OUTBOX_RETRY_MAX_MS: 60 * 60 * 1000,
  OUTBOX_RETRY_EXPONENT_LIMIT: 7,
  RECONCILIATION_AGE_MS: 30 * 60 * 1000,
  RECONCILIATION_RETRY_MS: 60 * 60 * 1000,
  RECONCILIATION_BATCH_SIZE: 50,
  OUTBOX_DEFAULT_ATTEMPTS: 0,
  OUTBOX_MINIMUM_ATTEMPTS: 0,
  OUTBOX_CRON_EXPRESSION: "* * * * *",
  RECONCILIATION_CRON_EXPRESSION: "*/15 * * * *",
});

const PAYOUT_MESSAGE = Object.freeze({
  UNSUPPORTED_PROVIDER: "Unsupported payout provider",
  WITHDRAWAL_NOT_FOUND: "Withdrawal request not found",
  WITHDRAWAL_APPROVAL_STATUS: (status) =>
    `Cannot approve a withdrawal with ${status} status`,
  PROVIDER_BENEFICIARY_MISSING: (provider) =>
    `${provider} did not return a beneficiary ID`,
  PROVIDER_CREDENTIALS_MISSING: (provider) =>
    `${provider} payout credentials are not configured`,
  PROVIDER_ACCOUNT_MISSING: "RazorpayX payout account number is not configured",
  PROVIDER_ENV_INVALID: "CASHFREE_PAYOUT_ENV must be sandbox or production",
  BENEFICIARY_ID_MISSING: "Cashfree did not return a beneficiary ID",
  WITHDRAWAL_USER_MISSING: "Withdrawal user not found",
  WITHDRAWAL_NO_LONGER_PROCESSING: "Withdrawal is no longer processing",
  WITHDRAWAL_CHANGED_BEFORE_REQUEST:
    "Withdrawal changed before provider request",
  OUTBOX_WITHDRAWAL_MISMATCH:
    "Payout outbox does not match the withdrawal provider reference",
  TRANSFER_ID_MISSING: "Provider response did not include a transfer ID",
  RAW_BODY_MISSING: "Webhook raw body is unavailable",
  SIGNATURE_HEADERS_MISSING: "Webhook signature headers are missing",
  INVALID_SIGNATURE: "Invalid webhook signature",
  EVENT_ALREADY_PROCESSING: "Payout event is already being processed",
  TRANSFER_IDENTITY_MISSING: "Transfer reference and ID are missing",
  WITHDRAWAL_NOT_FOUND_FOR_REFERENCE:
    "Withdrawal was not found for the provider reference",
  PROVIDER_REFERENCE_MISMATCH:
    "Provider reference does not match the withdrawal",
  PROVIDER_TRANSFER_ID_MISMATCH:
    "Provider transfer ID does not match the withdrawal",
  UNSUPPORTED_PROVIDER_STATUS: "Unsupported provider status",
  AMOUNT_MISMATCH: "Payout amount does not match withdrawal",
  CURRENCY_MISMATCH: "Payout currency does not match withdrawal",
  STATE_CHANGED_CONCURRENTLY: "Withdrawal payout state changed concurrently",
  REVERSAL_TOTAL_MISMATCH:
    "Completed withdrawal total could not be reversed safely",
  USER_OR_BANK_MISSING: "Associated user or bank details are missing",
  QUEUE_PAYOUT_FAILED: "Failed to queue payout",
  WITHDRAWAL_APPROVED_QUEUED:
    "Withdrawal approved. Payout is queued for processing.",
  WEBHOOK_SUCCESS: "Webhook processed successfully",
  WEBHOOK_RETRY: "Webhook processing failed; provider should retry delivery",
  WEBHOOK_FAILURE: "Failed to process webhook",
  PROVIDER_TRANSFER_DETAILS_MISMATCH:
    "Provider transfer does not match withdrawal amount, currency, or reference",
  OUTBOX_WORKER_FAILED: "Payout outbox worker failed",
  RECONCILIATION_FAILED: "Payout reconciliation failed",
  RECONCILIATION_SCAN_FAILED: "Payout reconciliation scan failed",
  WEBHOOK_PROCESSING_FAILED: "Payout webhook processing failed",
  AMOUNT_MISMATCH_LOG: "Payout provider amount mismatch",
  TRANSFER_SUBMISSION_LOG: "Payout provider transfer submission failed",
  OUTBOX_PROCESSING_LOG: "Payout outbox processing failed",
  WEBHOOK_PROCESSING_LOG: "Payout webhook processing failed",
  FCM_APPROVAL_LOG: "FCM withdrawal approval notification failed",
  FCM_NOTIFICATION_LOG: "FCM payout notification failed",
  NARRATION_PREFIX: "Payout of",
});

module.exports = {
  PAYOUT_PROVIDER,
  PAYOUT_PROVIDER_ENVIRONMENT,
  CASHFREE_PAYOUT_STATUS,
  CASHFREE_PAYOUT_STATUS_CODE,
  CASHFREE_PAYOUT_EVENT,
  RAZORPAYX_PAYOUT_EVENT,
  RAZORPAYX_PAYOUT_STATUS,
  PAYOUT_PROVIDER_VALUES,
  PAYOUT_EVENT_PROVIDER_VALUES,
  PAYOUT_OUTBOX_STATUS,
  PAYOUT_OUTBOX_STATUS_VALUES,
  PAYOUT_ATTEMPT_OUTCOME,
  PAYOUT_ATTEMPT_OUTCOME_VALUES,
  PAYOUT_EVENT_STATUS,
  PAYOUT_EVENT_STATUS_VALUES,
  PAYOUT_RECON_OUTCOME,
  PAYOUT_RECON_OUTCOME_VALUES,
  PAYOUT_SOURCE,
  PAYOUT_DELIVERY_SOURCE_VALUES,
  PAYOUT_CURRENCY,
  PAYOUT_TRANSFER_MODE,
  PAYOUT_ASSET,
  PAYOUT_ASSET_VALUES,
  PAYOUT_RESULT,
  PAYOUT_HTTP_STATUS,
  PAYOUT_TERMINAL_WITHDRAWAL_STATUSES,
  PAYOUT_FAILURE_TERMINAL_STATUSES,
  PAYOUT_LEDGER_MOVEMENT,
  PAYOUT_LEDGER_MOVEMENT_VALUES,
  PAYOUT_LEDGER_SOURCE,
  PAYOUT_LEDGER_SOURCE_VALUES,
  PAYOUT_CONFIG,
  PAYOUT_MESSAGE,
};

const { WITHDRAWAL_STATUS } = require("./withdrawals");
const { SYSTEM_ALERT_SEVERITY } = require("./alerts");

const PAYOUT_PROVIDER = Object.freeze({
  RAZORPAYX: "razorpayx",
  CASHFREE: "cashfree",
  MANUAL: "manual",
  UNKNOWN: "unknown",
});
const PAYOUT_METHOD = Object.freeze({
  MANUAL: "MANUAL",
  PROVIDER: "PROVIDER",
});
const PAYOUT_METHOD_VALUES = Object.freeze(Object.values(PAYOUT_METHOD));
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
const CASHFREE_PAYOUT_STATUS_CODE = Object.freeze({
  COMPLETED: "COMPLETED",
  SENT_TO_BENEFICIARY: "SENT_TO_BENEFICIARY",
});
const CASHFREE_PAYOUT_EVENT = Object.freeze({
  TRANSFER_REVERSED: "TRANSFER_REVERSED",
  TRANSFER_FAILED: "TRANSFER_FAILED",
  TRANSFER_REJECTED: "TRANSFER_REJECTED",
  TRANSFER_ACKNOWLEDGED: "TRANSFER_ACKNOWLEDGED",
  TRANSFER_SUCCESS: "TRANSFER_SUCCESS",
  BULK_TRANSFER_REJECTED: "BULK_TRANSFER_REJECTED",
  BENEFICIARY_INCIDENT: "BENEFICIARY_INCIDENT",
  CREDIT_CONFIRMATION: "CREDIT_CONFIRMATION",
  LOW_BALANCE_ALERT: "LOW_BALANCE_ALERT",
});
const CASHFREE_PAYOUT_TRANSFER_EVENTS = Object.freeze([
  CASHFREE_PAYOUT_EVENT.TRANSFER_REVERSED,
  CASHFREE_PAYOUT_EVENT.TRANSFER_FAILED,
  CASHFREE_PAYOUT_EVENT.TRANSFER_REJECTED,
  CASHFREE_PAYOUT_EVENT.TRANSFER_ACKNOWLEDGED,
  CASHFREE_PAYOUT_EVENT.TRANSFER_SUCCESS,
]);
const CASHFREE_BENEFICIARY_STATUS = Object.freeze({
  VERIFIED: "VERIFIED",
  INITIATED: "INITIATED",
  INVALID: "INVALID",
  DELETED: "DELETED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
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
const PAYOUT_RECORD_PROVIDER_VALUES = Object.freeze([
  ...PAYOUT_PROVIDER_VALUES,
  PAYOUT_PROVIDER.MANUAL,
]);
const PAYOUT_BENEFICIARY_STATUS = Object.freeze({
  READY: "READY",
  PENDING: "PENDING",
  FAILED: "FAILED",
  REJECTED: "REJECTED",
  UNKNOWN: "UNKNOWN",
});
const PAYOUT_BENEFICIARY_STATUS_VALUES = Object.freeze(
  Object.values(PAYOUT_BENEFICIARY_STATUS),
);
const PAYOUT_APPROVAL_SOURCE = Object.freeze({
  ADMIN: "ADMIN",
  AUTO: "AUTO",
});
const PAYOUT_APPROVAL_SOURCE_VALUES = Object.freeze(
  Object.values(PAYOUT_APPROVAL_SOURCE),
);
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
const PAYOUT_OPERATION = Object.freeze({
  OUTBOX_PROCESSING: "OUTBOX_PROCESSING",
  TRANSFER_STATUS_LOOKUP: "TRANSFER_STATUS_LOOKUP",
  BENEFICIARY_SETUP: "BENEFICIARY_SETUP",
  TRANSFER_ATTEMPT_CREATION: "TRANSFER_ATTEMPT_CREATION",
  TRANSFER_RECONCILIATION: "TRANSFER_RECONCILIATION",
  BATCH_STATUS_LOOKUP: "BATCH_STATUS_LOOKUP",
  BATCH_TRANSFER_SUBMISSION: "BATCH_TRANSFER_SUBMISSION",
  BATCH_RECONCILIATION: "BATCH_RECONCILIATION",
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

const PAYOUT_BATCH_STATUS = Object.freeze({
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  SUBMITTED: "SUBMITTED",
  RECONCILIATION_REQUIRED: "RECONCILIATION_REQUIRED",
  RECONCILED: "RECONCILED",
  MANUAL_REVIEW: "MANUAL_REVIEW",
  FAILED: "FAILED",
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
const PAYOUT_EMAIL_TEMPLATE = Object.freeze({
  WITHDRAWAL_SUCCESS: "users/withdrawalSuccess",
  WITHDRAWAL_FAILED: "users/withdrawalFailed",
});
const PAYOUT_EMAIL_SUBJECT = Object.freeze({
  WITHDRAWAL_SUCCESS: "Withdrawal completed successfully",
  WITHDRAWAL_FAILED: "Withdrawal could not be completed",
});
const PAYOUT_TRANSFER_MODE = Object.freeze({ IMPS: "IMPS" });
const PAYOUT_ASSET = Object.freeze({
  INR: "INR",
  HYDACON_COIN: "HYDACON_COIN",
  REWARD_POINT: "REWARD_POINT",
});
const PAYOUT_ASSET_VALUES = Object.freeze(Object.values(PAYOUT_ASSET));
const PAYOUT_RESULT = Object.freeze({
  SUCCESS: "success",
  IGNORED: "ignored",
  STATUS_CHECK: "status-check",
  MANUAL_COMPLETION: "MANUAL_COMPLETION",
  APPLIED: (status) => `applied:${status}`,
  STALE_OR_DUPLICATE: (current, requested) =>
    `stale-or-duplicate:${current}->${requested}`,
});
const PAYOUT_HTTP_STATUS = Object.freeze({
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CLIENT_ERROR_MIN: 400,
  SERVER_ERROR_MIN: 500,
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
  WITHDRAWAL_POINTS_DEBIT: "WITHDRAWAL_POINTS_DEBIT",
  WITHDRAWAL_POINTS_REFUND: "WITHDRAWAL_POINTS_REFUND",
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
  MANUAL_PAYOUT: "MANUAL_PAYOUT",
});
const PAYOUT_LEDGER_SOURCE_VALUES = Object.freeze(
  Object.values(PAYOUT_LEDGER_SOURCE),
);

const PAYOUT_CONFIG = Object.freeze({
  JSON_BODY_LIMIT: "256kb",
  MONGODB_OBJECT_ID_HEX_LENGTH: 24,
  MILLISECONDS_PER_SECOND: 1000,
  MINOR_UNITS_PER_INR: 100,
  MAX_NARRATION_LENGTH: 30,
  MAX_ERROR_LENGTH: 500,
  MANUAL_PAYMENT_REFERENCE_MIN_LENGTH: 3,
  MANUAL_PAYMENT_REFERENCE_MAX_LENGTH: 128,
  MANUAL_UTR_MAX_LENGTH: 64,
  MANUAL_COMPLETION_NOTES_MAX_LENGTH: 500,
  CANCELLATION_REASON_MIN_LENGTH: 5,
  CANCELLATION_REASON_MAX_LENGTH: 500,
  REDACT_DIGIT_SEQUENCE_LENGTH: 6,
  EVENT_LEASE_MS: 10 * 60 * 1000,
  OUTBOX_LEASE_MS: 2 * 60 * 1000,
  OUTBOX_LEASE_RENEW_INTERVAL_MS: 30 * 1000,
  OUTBOX_BATCH_SIZE: 20,
  OUTBOX_MAX_ATTEMPTS: 5,
  OUTBOX_RETRY_BASE_MS: 30 * 1000,
  OUTBOX_RETRY_MAX_MS: 60 * 60 * 1000,
  OUTBOX_RETRY_EXPONENT_LIMIT: 7,
  CASHFREE_BATCH_MIN_SIZE: 2,
  CASHFREE_BATCH_SANDBOX_MAX_SIZE: 1000,
  CASHFREE_BATCH_PRODUCTION_MAX_SIZE: 5000,
  CASHFREE_BATCH_BENEFICIARY_CONCURRENCY: 10,
  CASHFREE_BATCH_RECONCILIATION_INTERVAL_MS: 15 * 60 * 1000,
  CASHFREE_BATCH_REFERENCE_PREFIX: "hydacon_",
  CASHFREE_BENEFICIARY_ID_PREFIX: "hydacon_",
  CASHFREE_BENEFICIARY_ID_HASH_LENGTH: 20,
  CASHFREE_BENEFICIARY_ID_MAX_LENGTH: 50,
  CASHFREE_COUNTRY_CODE: "+91",
  CASHFREE_PHONE_COUNTRY_PREFIX: "91",
  CASHFREE_INTERNATIONAL_PHONE_LENGTH: 12,
  CASHFREE_TRANSFER_REMARKS_MAX_LENGTH: 70,
  CASHFREE_TRANSFER_REMARKS_DEFAULT: "Hydacon Payout",
  CASHFREE_DEFAULT_API_VERSION: "2024-01-01",
  CASHFREE_DEFAULT_TIMEOUT_MS: 15 * 1000,
  CASHFREE_REQUEST_ID_MAX_LENGTH: 50,
  CASHFREE_SANDBOX_BASE_URL: "https://sandbox.cashfree.com/payout",
  CASHFREE_PRODUCTION_BASE_URL: "https://api.cashfree.com/payout",
  RECONCILIATION_AGE_MS: 30 * 60 * 1000,
  RECONCILIATION_RETRY_MS: 60 * 60 * 1000,
  RECONCILIATION_BATCH_SIZE: 50,
  OUTBOX_DEFAULT_ATTEMPTS: 0,
  OUTBOX_MINIMUM_ATTEMPTS: 0,
  OUTBOX_CRON_EXPRESSION: "* * * * *",
  RECONCILIATION_CRON_EXPRESSION: "*/15 * * * *",
});

const PAYOUT_ALERT_TYPE = Object.freeze({
  WEBHOOK_SIGNATURE_FAILURE: "PAYOUT_WEBHOOK_SIGNATURE_FAILURE",
  RECONCILIATION_MISMATCH: "PAYOUT_RECONCILIATION_MISMATCH",
  RETRIES_EXHAUSTED: "PAYOUT_RETRIES_EXHAUSTED",
  MANUAL_REVIEW_REQUIRED: "PAYOUT_MANUAL_REVIEW_REQUIRED",
});

const PAYOUT_ALERT_SEVERITY = Object.freeze({
  WARNING: SYSTEM_ALERT_SEVERITY.WARNING,
  CRITICAL: SYSTEM_ALERT_SEVERITY.CRITICAL,
});

const PAYOUT_MESSAGE = Object.freeze({
  UNSUPPORTED_PROVIDER: "Unsupported payout provider",
  WITHDRAWAL_NOT_FOUND: "Withdrawal request not found",
  WITHDRAWAL_APPROVAL_STATUS: (status) =>
    `Cannot approve a withdrawal with ${status} status`,
  PROVIDER_BENEFICIARY_MISSING: (provider) =>
    `${provider} did not return a beneficiary ID`,
  BENEFICIARY_NOT_READY:
    "Your bank account is still being verified for payouts. Please try again once verification is complete.",
  KYC_REQUIRED: "KYC approval is required to request a withdrawal.",
  AUTO_PAYOUT_KYC_REQUIRED:
    "Auto payout can only be enabled for a user with approved KYC.",
  AUTO_PAYOUT_DISABLED:
    "Automatic payouts were disabled before this withdrawal could be queued.",
  USER_NOT_FOUND: "User not found",
  BANK_BENEFICIARY_SETUP_FAILED: "Bank account beneficiary provisioning failed",
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
  CASHFREE_WEBHOOK_SECRET_MISSING:
    "Cashfree payout webhook secret is not configured",
  SIGNATURE_HEADERS_MISSING: "Webhook signature headers are missing",
  INVALID_SIGNATURE: "Invalid webhook signature",
  WEBHOOK_SIGNATURE_REJECTED: "Payout webhook signature verification failed",
  EVENT_ALREADY_PROCESSING: "Payout event is already being processed",
  TRANSFER_IDENTITY_MISSING: "Transfer reference and ID are missing",
  NON_TRANSFER_EVENT_IGNORED:
    "Cashfree non-transfer event was recorded without changing a withdrawal",
  BENEFICIARY_INCIDENT_LOG: "Cashfree reported a beneficiary incident",
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
  MANUAL_PAYOUT_CREATED:
    "Withdrawal approved and added to the manual payouts queue.",
  WITHDRAWAL_BATCH_APPROVED_QUEUED:
    "Withdrawal batch approved and queued for Cashfree processing.",
  WEBHOOK_SUCCESS: "Webhook processed successfully",
  WEBHOOK_RETRY: "Webhook processing failed; provider should retry delivery",
  WEBHOOK_FAILURE: "Failed to process webhook",
  PROVIDER_TRANSFER_DETAILS_MISMATCH:
    "Provider transfer does not match withdrawal amount, currency, or reference",
  OUTBOX_WORKER_FAILED: "Payout outbox worker failed",
  PAYOUT_BATCH_WORKER_FAILED: "Payout batch worker failed",
  PAYOUT_BATCH_PROVIDER_REQUIRED:
    "Cashfree must be the configured payout provider for batch approvals",
  PAYOUT_BATCH_SIZE_INVALID: (minimum, maximum) =>
    `Select between ${minimum} and ${maximum} withdrawals for batch approval`,
  PAYOUT_BATCH_IDS_REQUIRED: "Select withdrawals to approve as a batch",
  PAYOUT_BATCH_ID_INVALID: "Each withdrawal ID must be a valid MongoDB ID",
  PAYOUT_BATCH_DUPLICATE_WITHDRAWALS:
    "Duplicate withdrawal IDs are not allowed",
  PAYOUT_BATCH_PROVIDER_CONFLICT:
    "The withdrawal is already assigned to another payout provider",
  PAYOUT_BATCH_TRANSFER_EXISTS:
    "A provider transfer already exists for this withdrawal",
  PAYOUT_BATCH_BANK_UNAVAILABLE:
    "The user or an active bank account is unavailable",
  PAYOUT_BATCH_BANK_OWNER_MISMATCH:
    "The bank account does not belong to the withdrawal user",
  PAYOUT_BATCH_CHANGED_DURING_APPROVAL:
    "One or more selected withdrawals changed during batch approval",
  PAYOUT_BATCH_OUTBOX_INCOMPLETE:
    "Payout batch does not have all its withdrawal outbox records",
  PAYOUT_BATCH_WITHDRAWAL_MISSING: "A payout batch withdrawal no longer exists",
  PAYOUT_BATCH_WITHDRAWAL_INELIGIBLE: (id, reason) =>
    `Withdrawal ${id} cannot be included in a payout batch: ${reason}`,
  PAYOUT_BATCH_AMOUNT_INVALID:
    "Cashfree batch payouts require INR amounts greater than ₹1 with paise precision",
  PAYOUT_BATCH_STATUS_UNKNOWN:
    "Cashfree batch status could not be confirmed; reconciliation is required",
  PAYOUT_BATCH_TRANSFER_STATUS_INCOMPLETE: (count) =>
    `Cashfree batch status is incomplete for ${count} transfer(s)`,
  PAYOUT_BATCH_TRANSFER_STATUS_INVALID:
    "Cashfree returned a transfer without a recognized status",
  PAYOUT_BATCH_RECONCILIATION_QUEUED:
    "Cashfree batch rejection received; transfer reconciliation was queued",
  CASHFREE_BENEFICIARY_ID_MISSING: "Cashfree did not return a beneficiary ID",
  RECONCILIATION_FAILED: "Payout reconciliation failed",
  RECONCILIATION_SCAN_FAILED: "Payout reconciliation scan failed",
  WEBHOOK_PROCESSING_FAILED: "Payout webhook processing failed",
  AMOUNT_MISMATCH_LOG: "Payout provider amount mismatch",
  TRANSFER_SUBMISSION_LOG: "Payout provider transfer submission failed",
  OUTBOX_PROCESSING_LOG: "Payout outbox processing failed",
  OUTBOX_RETRIES_EXHAUSTED: "Automatic payout retry limit was reached",
  PAYOUT_MANUAL_REVIEW_REQUIRED:
    "Payout requires manual provider reconciliation",
  WEBHOOK_PROCESSING_LOG: "Payout webhook processing failed",
  FCM_APPROVAL_LOG: "FCM withdrawal approval notification failed",
  FCM_NOTIFICATION_LOG: "FCM payout notification failed",
  EMAIL_NOTIFICATION_LOG: "Payout email notification failed",
  PAYOUT_NOTIFICATION_LOG: "Payout outcome notification failed",
  WITHDRAWAL_FAILED_DEFAULT:
    "The provider could not complete the transfer. Contact support if you need help.",
  AUTO_PAYOUT_KYC_UPDATED_LOG: "Automatic payout setting updated",
  NARRATION_PREFIX: "Payout of",
  MANUAL_PAYOUT_ONLY:
    "This action is only available for a pending manual payout",
  MANUAL_PAYOUT_REFERENCE_REQUIRED:
    "A payment reference is required to complete a manual payout",
  MANUAL_PAYOUT_CANCELLED:
    "Manual payout cancelled and withdrawal balance refunded",
  MANUAL_PAYOUT_COMPLETED: "Manual payout marked as completed",
  MANUAL_PAYOUT_PROVIDER_CONVERTED:
    "Manual payout queued with the configured provider",
  CANCELLATION_REASON_REQUIRED:
    "A cancellation reason of at least 5 characters is required",
  WITHDRAWAL_CANCELLED:
    "Withdrawal request cancelled and balance refunded successfully",
});

module.exports = {
  PAYOUT_PROVIDER,
  PAYOUT_METHOD,
  PAYOUT_METHOD_VALUES,
  PAYOUT_PROVIDER_ENVIRONMENT,
  CASHFREE_PAYOUT_STATUS,
  CASHFREE_PAYOUT_STATUS_CODE,
  CASHFREE_PAYOUT_EVENT,
  CASHFREE_PAYOUT_TRANSFER_EVENTS,
  CASHFREE_BENEFICIARY_STATUS,
  RAZORPAYX_PAYOUT_EVENT,
  RAZORPAYX_PAYOUT_STATUS,
  PAYOUT_PROVIDER_VALUES,
  PAYOUT_RECORD_PROVIDER_VALUES,
  PAYOUT_BENEFICIARY_STATUS,
  PAYOUT_BENEFICIARY_STATUS_VALUES,
  PAYOUT_APPROVAL_SOURCE,
  PAYOUT_APPROVAL_SOURCE_VALUES,
  PAYOUT_EVENT_PROVIDER_VALUES,
  PAYOUT_OUTBOX_STATUS,
  PAYOUT_OPERATION,
  PAYOUT_OUTBOX_STATUS_VALUES,
  PAYOUT_BATCH_STATUS,
  PAYOUT_ATTEMPT_OUTCOME,
  PAYOUT_ATTEMPT_OUTCOME_VALUES,
  PAYOUT_EVENT_STATUS,
  PAYOUT_EVENT_STATUS_VALUES,
  PAYOUT_RECON_OUTCOME,
  PAYOUT_RECON_OUTCOME_VALUES,
  PAYOUT_SOURCE,
  PAYOUT_DELIVERY_SOURCE_VALUES,
  PAYOUT_CURRENCY,
  PAYOUT_EMAIL_TEMPLATE,
  PAYOUT_EMAIL_SUBJECT,
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
  PAYOUT_ALERT_TYPE,
  PAYOUT_ALERT_SEVERITY,
  PAYOUT_MESSAGE,
};

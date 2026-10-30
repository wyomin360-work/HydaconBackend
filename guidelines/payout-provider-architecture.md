# Payout provider architecture

## Provider contract

Payout business logic lives in `src/modules/payouts/`, separate from the
withdrawal request module. Keep the service layer to three cohesive services:
`payout-execution.service.js` for individual transfers, retries, and transfer
audit; `payout-batch.service.js` for batch approval, execution, and recovery;
and `payout-state.service.js` for applying provider outcomes and their ledger
effects. Shared payout helpers belong alongside these services. The withdrawals,
webhooks, and recovery cron modules call the payout services through their
public exports rather than owning payout execution logic.

Each adapter under `src/functions/payouts/providers/<provider>` owns its API
requests, request/response mapping, and webhook signature verification. The
registry resolves an adapter from `PAYOUT_PROVIDER` for new approvals or from the
provider stored on an existing withdrawal. Adapters expose:

- `createBeneficiary(...)`
- `initiateTransfer(...)`
- `getTransferStatus({ referenceId })`
- `verifyWebhook(headers, rawBody)`
- `normalizeWebhook(body, headers)`
- `createIdempotencyKey(referenceId)`

Providers that support batch execution may additionally expose
`initiateBatchTransfer({ batchReferenceId, transfers })` and
`getBatchTransferStatus({ batchReferenceId })`. Batch requests still have one
stable transfer reference and one outbox/audit trail per withdrawal. A group
record coordinates submission and batch-level reconciliation; provider batch
acceptance does not mark its individual transfers completed.

Adapter mappings convert provider-specific payloads to a canonical payout event
with a stable reference, provider transfer ID, amount in minor currency units,
currency, UTR, provider status, and canonical status. INR amounts are stored as
rupees on the withdrawal and converted to paise at the adapter boundary.

## Approval and processing

Admin approval atomically changes a pending withdrawal to `PROCESSING`, persists
its provider and stable reference, and creates one unique `PayoutOutbox` record.
After commit, the application wakes the outbox worker immediately; the scheduled
worker remains the recovery mechanism.
A leased worker claims outbox rows, resolves or creates the provider beneficiary,
checks provider status by the stable reference, records an immutable payout
attempt, and submits using the same reference. This allows recovery if the worker
crashes before or after the external request. Provider choice is immutable for an
approved withdrawal; ambiguous provider outcomes are reconciled against that
provider before any further request.

Outbox worker failures use bounded exponential backoff. Each failed worker pass
is written to payout reconciliation audit with the operation, retry number,
provider error code/status, and sanitized cause. At the retry limit the outbox
is failed and surfaced in admin details. The withdrawal is marked failed and
refunded only when no provider request could have been submitted; otherwise it
remains unresolved for manual provider reconciliation to prevent a duplicate
payout or an incorrect refund.

Cashfree batch approval validates the complete selected set before changing any
withdrawal. It atomically creates a batch record and links each withdrawal's
outbox to it. The worker resolves every beneficiary before submitting one batch
request. Ambiguous batch outcomes are checked with the batch-status API before
another submission. Submitted batches are polled through the batch-status API on
a recovery schedule, and its per-transfer results update each withdrawal. The
individual-transfer reconciliation job excludes batch-linked withdrawals;
per-transfer webhooks can still update them in real time.

## Webhooks, ledger, and reconciliation

Provider webhook endpoints verify signatures against the raw request bytes
before validating the provider event envelope, normalizing, or recording
payloads. Provider-specific AJV schemas reject unrecognized fields and validate
the documented payout event envelope. Adapter mappings persist only allowlisted
normalized fields. Events are deduplicated by provider and
event identity, checked against the persisted reference, transfer ID, amount, and
currency, then applied in a MongoDB transaction. Completion increments the
reported INR withdrawal total once. Failure or reversal refunds coins once. A
reversal after completion also writes a compensating INR ledger entry and
reduces the reported total. The periodic reconciliation job queries each
withdrawal's persisted provider and applies the same canonical state handler.

Provider responses and webhook payloads written to audit records are allowlisted
and redacted. Bank account data remains encrypted in the user bank account; the
provider beneficiary reference is associated with a keyed account fingerprint.

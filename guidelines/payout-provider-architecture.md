# Payout provider architecture

## Provider contract

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

Adapter mappings convert provider-specific payloads to a canonical payout event
with a stable reference, provider transfer ID, amount in minor currency units,
currency, UTR, provider status, and canonical status. INR amounts are stored as
rupees on the withdrawal and converted to paise at the adapter boundary.

## Approval and processing

Admin approval atomically changes a pending withdrawal to `PROCESSING`, persists
its provider and stable reference, and creates one unique `PayoutOutbox` record.
A leased worker claims outbox rows, resolves or creates the provider beneficiary,
checks provider status by the stable reference, records an immutable payout
attempt, and submits using the same reference. This allows recovery if the worker
crashes before or after the external request. Provider choice is immutable for an
approved withdrawal; ambiguous provider outcomes are reconciled against that
provider before any further request.

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

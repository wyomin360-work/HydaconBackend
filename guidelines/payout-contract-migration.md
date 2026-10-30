# Provider independent payout rollout

The payout flow uses a provider adapter and persists the selected provider and
stable provider reference on each approved withdrawal. New provider selection is
controlled by `PAYOUT_PROVIDER`; an in-flight withdrawal never changes provider.
The database outbox is the durable queue. Workers reconcile by the same stable
reference before retrying a submission, and ambiguous outcomes never trigger a
provider switch.

## Production rollout

1. Take and verify a database backup.
2. Stop payout approvals and payout worker/reconciliation processes while deploying
   the schema migration.
3. Configure provider credentials and webhook secrets in the secret manager.
   Keep `PAYOUT_PROVIDER=razorpayx` during the first provider independent rollout.
4. Run `npm run migrate:payout-contract` against the target database. It renames
   the historical audit collections and fields, marks historical activity as
   RazorpayX, preserves legacy beneficiary IDs, and creates outbox rows for
   processing withdrawals that have no recorded transfer ID.
5. Confirm the migration succeeds and inspect migrated processing withdrawals,
   payout references, audit rows, and beneficiary mappings.
6. Run `npm run migrate:payout-records` to create the dedicated Payout documents
   for historical withdrawals that show evidence of an approval or provider
   attempt. The migration is idempotent and excludes pending requests and
   cancellations that never reached payout approval.
7. Deploy the backend and admin application together. Confirm the payout outbox
   worker, database indexes, webhook signature configuration, and reconciliation
   job are healthy before reopening approvals.
   Configure `SYSTEM_MANAGER_EMAIL` and the mail transport in the production
   secret manager. High and critical alerts, including webhook signature
   failures, provider reconciliation mismatches, retry exhaustion, and payouts
   requiring manual review, are sent using the shared system alert module.
   Error messages and stacks are sanitized before being placed in the alert
   email. Delivery failures are logged; alert email delivery does not use a
   durable queue, so the mail transport should be monitored separately.
8. Configure RazorpayX to `/webhooks/razorpayx`. Configure Cashfree Payouts V2
   to `/webhooks/cashfree`. `/webhooks/payout` resolves to the currently selected
   `PAYOUT_PROVIDER` for installations that use one provider webhook URL.
9. To enable Cashfree for new approvals, set `PAYOUT_PROVIDER=cashfree` only after
   Cashfree onboarding, production credentials, payout limits, and webhook
   delivery have been verified. Existing withdrawal records continue to use
   their persisted provider.

Cashfree settings are `CASHFREE_PAYOUT_ENV` (`sandbox` or `production`),
`CASHFREE_PAYOUT_CLIENT_ID`, `CASHFREE_PAYOUT_CLIENT_SECRET`, and optional
`CASHFREE_PAYOUT_API_VERSION` (defaults to `2024-01-01`),
`CASHFREE_PAYOUT_TIMEOUT_MS`, and public key settings when API request signing is
required. Keep `PAYOUT_FINGERPRINT_SECRET` stable across deployments; if omitted,
the service derives beneficiary fingerprints from `ENCRYPTION_SECRET`.

The migration is idempotent and aborts if old and new collections coexist or a
record contains conflicting old and new field values. Resolve collisions from a
verified backup before retrying. Keep payout processing paused if the migration
reports a conflict.

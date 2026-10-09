# Payout contract rename

The payout models and API fields now use provider-neutral names. Before deploying
the new backend version to a database that has run the previous payout flow:

1. Take and verify a database backup.
2. Stop payout processing so webhooks and reconciliation jobs cannot write during
   the migration.
3. Run `npm run migrate:payout-contract` against the target database.
4. Confirm the command succeeds, then deploy the backend and admin application
   together.
5. Configure the payout provider webhook to use `/webhooks/payout`. The legacy
   `/webhooks/razorpayx` route remains available during the transition.

The migration renames the old audit collections and persisted payout fields,
and normalizes old ledger source values. It aborts if both old and new audit
collections exist or if a record contains both old and new versions of a field;
resolve those collisions manually before retrying. The script is idempotent and
can be rerun after an interrupted migration.

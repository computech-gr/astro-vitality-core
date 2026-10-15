# P36.2B9 — Concurrent Authorization & Audit Integrity

**Staged only. No shared Cloud DB migration, browser write grant, approval, import, or appeal endpoint.**

## Changes

- `p36_validate_review_memberships` reads both submitter and reviewer `mission_memberships` rows `FOR SHARE`. The locks are held until transaction end, serializing role changes/deactivation against a quarantine decision. Revocation that commits first causes the decision to fail; a decision that commits first may precede revocation, which is then allowed.
- `p36_validate_quarantine_event_insert` rejects direct audit inserts using trigger nesting and verifies all event fields against the quarantined batch under a row lock. The batch transition and audit event remain atomic.
- Existing deny-all forced RLS, append-only event updates/deletes, synthetic-only constraints and no approval path remain.

## Mandatory acceptance in disposable PostgreSQL

1. Full governed migrations plus staged SQL, twice; all existing DB tests.
2. Two separate sessions with explicit transactions and controlled synchronization: reviewer deactivation commits before quarantine check; quarantine lock acquired before deactivation; submitter deactivation before/after decision; two reviewers on same batch. Assert the serial ordering, event count, and that a revoked reviewer **cannot commit a later decision**.
3. Direct privileged event INSERT on pending batch and on already-quarantined batch must fail; mismatched fields must fail. Automatic quarantine must write exactly one matching event; failure of event insert must roll back status.
4. Browser grants/RLS, no RPC endpoints, existing B4–B8 tests and `bun run check`.

## Limits

This is database-level ordering, not an assurance that a revocation requested earlier always wins: transactions serialize according to lock acquisition. An owner/superuser can disable triggers and bypass this control. `pg_trigger_depth` is defense in depth, not cryptographic origin proof; independent operational audit and least-privilege service roles remain required. No service receipt, request id, retention policy, appeal or re-review path exists. FV-01-13 OPEN; P32/P34 PENDING; final security gate BLOCKED; clinical activation DISABLED.

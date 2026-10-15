# P36.2B10 — Audit Origin & Service Evidence Foundation

## Scope

Staged replacement of the **unapplied** P36 review SQL. No browser write grants, service endpoints, imports, scientific approvals, or appeals. Synthetic-only acceptance in disposable PostgreSQL. Never apply to shared Lovable Cloud without explicit owner authorization.

## Implemented

- A single pending-to-quarantined transition generates a database UUID `decision_request_id`, `decision_received_at` using `clock_timestamp()`, and the internal `decision_authorization_basis` **after** locked submitter/reviewer membership validation.
- The event copies all three fields atomically; its INSERT guard checks them against the quarantined batch. Unique IDs and append-only guards protect against replay and mutation.
- Pending submissions cannot supply decision receipts. No client-facing service or HTTP request ID is claimed.
- Prior B9 row locks, rollback semantics, deny-all RLS and no-browser-grants remain unchanged.

## Important security limitation

The B9 `pg_trigger_depth()` provenance check remains **defense-in-depth only**. A database owner can install triggers, disable controls, or forge nested depth. Database-generated receipts are correlation metadata, **not cryptographic proof of origin**, and do not solve owner-level tampering. A later activation gate must separate migration/owner roles from a narrowly-scoped writer and use independent operational auditing. Do not describe this phase as a complete solution to privileged forgery.

## Required Lovable acceptance

1. Apply the entire governed migration chain plus the staged SQL in throwaway PostgreSQL 17.9; verify repeatability.
2. Run all previous 155 database checks and existing security tests.
3. Test valid quarantine creates exactly one event with identical receipt UUID, server time and authorization basis; reject pending inserts carrying receipts and reject tampered event receipts.
4. Run two-session revocation/quarantine tests in both lock orderings, with rollback and duplicate requests.
5. Verify browser deny-all, no new RPCs, no change to MISSION_TEST, no shared database migration.

## Unresolved gates

FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED. Future: HTTP request receipts, retention/appeals, independent audit and least-privilege writer design.

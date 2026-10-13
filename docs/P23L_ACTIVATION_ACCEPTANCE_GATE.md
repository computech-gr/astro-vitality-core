# P23L — First Operator Activation Acceptance Gate

## Purpose

No further UI or bootstrap migrations are required solely to repeat static readiness checks. This gate separates code verification from owner-authorized deployment execution.

## Owner execution — manual, not automated

1. Open the **published** Mission Identity route and register/confirm an account. Verify sign-in succeeds.
2. On a trusted local computer run `node scripts/prepare-first-operator-bootstrap.mjs`. Keep the secret private. Do not commit, log, paste, screenshot, or send the secret. Share only the hash-only SQL statement with the authorized Lovable Cloud database operator and explicitly approve its **single** execution.
3. The privileged operator verifies the target project/environment and runs only the approved hash-only `configure_mission_bootstrap` statement. Record success/failure **without exposing secrets**. Stop on any mismatch or unexpected database state.
4. In the signed-in Mission Identity form, redeem the private secret once; confirm the operator membership is visible. Never repeat or bypass the one-time activation.
5. Create and activate a test mission and active crew member; issue separate crew-self and ground-medical invitations; accept them using distinct confirmed accounts.
6. Run authorized synthetic browser-to-cloud sync, idempotency, RLS isolation and read-after-write checks. Record PASS/FAIL with timestamps and sanitized record IDs, never health payloads.
7. Test offline/reconnect and Camera PPG on a real device separately. A new installation cannot be assumed to retain the prior device's non-extractable encryption key or unsynced data; do not claim restoration without evidence.

## Hard stop conditions

- No confirmed signed-in account; privileged database access unavailable; wrong Supabase project; bootstrap already consumed; existing active operator; failed RPC; membership missing; RLS violation.
- No secret, password, service-role key, or private medical value should be provided in chat or attached to evidence.
- A successful static verifier is **not** proof of database execution, browser sign-in, cloud persistence, or device validation.

## Scope

This patch adds a reproducible **static** acceptance gate and this runbook. It does not execute privileged SQL, create accounts, apply migrations, or alter clinical data.

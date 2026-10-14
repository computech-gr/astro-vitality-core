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

## Recorded evidence (FV-01.4.5, read-only, non-secret)

Read-only production query of `mission_bootstrap_control` and `mission_memberships` (2026-10-14):

| Item | Value |
| --- | --- |
| Bootstrap armed at | 2026-10-11 21:22:03 UTC |
| Bootstrap consumed at | 2026-10-11 21:26:08 UTC (single consumption, ~4 min after arming) |
| Bootstrap mission | MISSION_TEST |
| Consumer holds an active Mission Operator membership in that mission | Yes (1) |

Status: steps 1–4 (account, arming, one-time redemption, operator membership) are **recorded as completed**. No secret, hash value, user ID or email is recorded here.

Gaps:
- The stored secret hash was not cleared after consumption. It is inert (consumption is single-use and `consumed_at` is set), but clearing it would need a privileged write and separate owner authorization.
- No timestamped owner record exists for steps 5–7 of this runbook as a single P23L run. Related evidence lives in the FV-01.4.x documents (B1–B7); duplicate/cross-mission write tests remain NOT EXECUTED and real-device offline/Camera PPG tests remain NOT EXECUTED (P34).
- The bootstrap must never be repeated or re-armed.

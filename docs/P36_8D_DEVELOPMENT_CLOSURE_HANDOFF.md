# P36.8D — Development closure and deferred live acceptance

Status: **READY_FOR_LIVE_ACCEPTANCE**; **NOT ACCEPTED**. This document closes the development preparation, not the live evidence gate.

## Confirmed by Lovable report (not independently reproduced here)

- Governed migration 0010 is deployed in Lovable Cloud; approved SHA-256: `7a233de35794684da7dfc4ffd7b657c3a545bf0f96a1d6f86733853bae4f07f1`.
- 376 application checks and 305 disposable PostgreSQL checks passed; CI quality and security scans green on main `4f28db73`.
- The original synthetic batch `e985ff6e-810f-419a-89a8-2376e217cb9f` remains pending, eight values unchanged; no live decision.
- P36.8B UI has not been published; no live authenticated reviewer acceptance has occurred.

## Development handoff

1. Keep P36.8A/B/C code and migration 0010 unchanged. No additional SQL, no new privileges, no new reviewer decisions.
2. Check current GitHub CI for the exact HEAD and record SHA and results; a prior green SHA does not prove a newer HEAD.
3. Confirm publish readiness only. Do **not** publish without separate explicit owner authorization.
4. Preserve the 11-step checklist in `docs/P36_8D_ACCEPTANCE_EVIDENCE_CHECKLIST.md` as the sole live acceptance protocol.
5. Before live acceptance, agree a controlled same-idempotency-key replay method that uses authorized authenticated requests and does not expose tokens, keys or credentials in logs. The current UI cannot replay after navigation; do not misreport that check as passed.
6. Live test only in FV01-TEST-B using a **new** synthetic batch, never the original batch; leave MISSION_TEST untouched.
7. Capture independent reviewer sign-off only after the actual signed-in checks and post-decision read-only evidence.

## Scientific documentation dependency

Two scientific documents from Nikolas are pending. Review them before asking Claude to update the scientific foundation, biomarker matrix, roadmap and architecture. Do not invent their content or implement scientific rule changes until reviewed.

## Standing constraints

Synthetic-only, research demonstration, not clinical. FV-01.13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical features disabled. Backup: OWNER_MANAGED_BACKUP_RISK_ACCEPTED (no verified restore). Separate Supabase project is out of scope.

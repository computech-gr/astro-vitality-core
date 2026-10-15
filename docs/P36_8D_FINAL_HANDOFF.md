# P36.8D — Final development handoff and CI evidence gate

Status: **READY_FOR_LIVE_ACCEPTANCE**, not ACCEPTED. This document is a handoff only.

## Verified baseline (Lovable report, 2026-10-16)

- `bun run check`: 382 passed, 0 failed; disposable PostgreSQL: 305/305.
- Migrations 0009 and 0010 unchanged; original FV01-TEST-B eight-item synthetic batch remains pending with no decision.
- GitHub HEAD `52f26669` was green for quality/security, but **did not include** the replay-readiness changes. CI for the resulting commit is **NOT VERIFIED**.

## Exact-commit CI evidence

Before publishing, record the actual commit SHA containing this handoff and all P36.8D changes, the quality and security workflow names, URLs, conclusions and completion times. A green earlier commit does not satisfy this gate. Preview deployment may remain intentionally skipped. If the exact-commit CI is not complete, leave step 1 unchecked.

## Deferred live acceptance

Preserve the existing 11-step checklist in `docs/P36_8D_ACCEPTANCE_EVIDENCE_CHECKLIST.md`. No step may be marked PASS without evidence. In particular, step 8 remains **NOT_RUN** until a separately reviewed, owner-approved, local-only same-key replay method has been tested in a disposable database and then explicitly authorized for one new synthetic FV01-TEST-B batch. No public replay UI, no persistence or logging of keys or credentials.

Do not use or decide the original eight-item batch. Do not publish, execute live decisions, change SQL/RLS/memberships, touch MISSION_TEST or activate clinical features as part of this handoff.

## Other deferred work

- Review Nikolas's two scientific documents before changing biomarker rules, scientific architecture or roadmap.
- P35.5 scope must be confirmed from its original requirements before implementation.
- Manual Audit Viewer screen-reader review is deferred by owner priority; retain existing accessibility behavior and do not claim WCAG certification.

Standing gates: FV-01.13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical DISABLED. Backup: OWNER_MANAGED_BACKUP_RISK_ACCEPTED, not independently verified.

# P36.2B7 — Pending Review Resolution After Revocation

## Scope

Staged SQL only; **not deployed**. The only newly permitted historical batch update is `pending_review` → `quarantined` when the original submitter is no longer active/eligible. The submitter identity, mission/crew, source metadata and creation timestamp are immutable. An active, independent `ground_medical` reviewer on the same mission must be recorded. A newly inserted batch must start pending without reviewer. No `approved`/`rejected` transition is enabled by this design.

## Non-goals and gates

No browser grants, ingestion API, review API, RPC, clinical workflow or production migration. No changes to `MISSION_TEST` or its crew. The existing item rows are not promoted or altered. FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED.

## Disposable DB acceptance (must run in Lovable)

1. Existing migration chain + staged SQL, rerun migration, existing 155 DB checks.
2. New valid synthetic batch inserted by active Crew Self. New insertion from revoked Crew Self denied. New insertion directly as quarantined/rejected/approved denied.
3. Deactivate original submitter. Existing batch remains pending. Privileged isolated test update to quarantined by active independent Ground Medical reviewer succeeds; preserve snapshots, mission, crew, fingerprint and date.
4. Quarantine fails for active submitter, inactive/wrong-role/same-user/cross-mission reviewer, wrong snapshot, and attempted edits to scope/source/identity.
5. No transitions to approved/rejected, no repeat decisions, no edits to decided records; no anonymous/authenticated access, no public function execution.
6. Review membership role/active revocation remains immediate. Ensure any existing P36.2B6 test assumptions about update semantics are adapted without dropping coverage.

## Outstanding design decision

Quarantine is a terminal administrative state, **not scientific approval**. A future independently reviewed server-side service must authorize each request, log a durable audit event, handle reviewer revocation/races and define retention/appeal. The present schema alone is not authorization to execute a workflow.

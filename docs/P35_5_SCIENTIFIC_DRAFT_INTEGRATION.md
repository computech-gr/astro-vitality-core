# P35.5 Scientific Draft Intake — 2026-10-18

## Scope

Adds a searchable **read-only** proposal catalog to Immune and Behavioral domain pages, using 35 IMM and 36 BSC entry names from the supplied Claude handbooks. No backend, migration, RLS, clinical rule, ingestion, Matrix v1.1 change, or identity/authorization change.

## Science and release gates

All 71 proposals remain `PENDING_NIKOLAS_REVIEW`. The two handbooks and 34 change-register proposals are not independently reviewed. Literature verification is incomplete. Never infer an approved metric, specimen, unit, frequency, domain routing, risk score, alert or diagnosis from this catalog. Bone and cardiovascular handbooks and original Matrix v1.1 remain authoritative baselines subject to review. The future P35.5 approval/reconciliation and full domain-routing work require explicit independent scientific sign-off and a separate implementation review.

## Demo/security

Do not grant administrator blanket RLS bypass or impersonation. A full synthetic demo workflow requires separately designed and authorized demo-only capabilities. FV-01.13, P32/P34, clinical activation and real-data ingestion gates remain unchanged. `MISSION_TEST` must not be modified.

## Acceptance

Run repository standard checks; visit `/mission/immune-health` and `/mission/behavioral-health`, confirm 35/36 proposals, search works, and no private data is exposed through the catalog. Verify existing Crew Self evidence authorization remains unchanged. No database migration is included.

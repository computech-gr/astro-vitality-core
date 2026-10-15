# P36.2B2 — Synthetic reviewed biomarker handoff (safe staging)

This patch deliberately **does not enable database persistence**. The existing `mission_events` and `crew_health_record_index` infrastructure is not a sufficient basis to assert secure human-reviewed medical document ingestion. FV-01-13 remains OPEN, P32/P34 PENDING and the final security gate BLOCKED.

## Implemented

- Mission-bound, crew-bound local review JSON export, requiring active Crew Self membership.
- Manual checkbox per exact-name/exact-unit matched metric, review confirmation and observation date.
- Reject duplicate selected metric IDs in one handoff.
- Export is marked `LOCAL_REVIEW_ONLY_NOT_APPROVED_FOR_IMPORT`, `syntheticOnly: true`.
- No database migration, network request, raw document upload or cloud observation write.
- Sign-in password guidance no longer displays signup password strength warnings.

## Blocking requirements for actual P36.2B persistence

- Independent review of authorization and role-specific approval (Crew Self must not self-approve scientific values).
- Design mission-scoped immutable review records and server-side identity enforcement, not client-supplied crew/mission IDs alone.
- RLS negative tests for cross-mission and cross-crew access, approval, replay and duplicate handling.
- Provenance integrity and retention/deletion/privacy policy, plus synthetic end-to-end browser tests.
- Re-evaluate FV-01-13 and final security gate before any real medical data.

The local JSON file contains extracted values; use **synthetic files only** and do not distribute it as clinical evidence.

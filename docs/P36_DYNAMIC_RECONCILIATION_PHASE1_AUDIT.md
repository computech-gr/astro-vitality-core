# P36 Dynamic Reconciliation — Phase 1 audit and stop point

Status: PHASE 1 ONLY. Pure, read-only, local-only. No SQL, migration, Cloud write, UI change, approval or publish.

## Read-only inventory (reusable pieces)
| Area | Path | Notes |
|---|---|---|
| Term grouping (label + exact unit, FNV ID `ubt-xxxxxxxx`) | `src/domain/health-intelligence/unknown-biomarker-review.ts` | `buildUnknownBiomarkerTerms`, `termIdFor`, ground-medical-only decisions, always `PENDING_NIKOLAS_REVIEW`. |
| Local pending requests (the 197-term request lives here) | `src/domain/health-intelligence/review-ledger.ts` (`savePendingReviewRequest`, `listUnknownBiomarkerReviewState`) over `infrastructure/offline/review-ledger-store.ts` | Encrypted IndexedDB on ONE device. Never queued for sync. No server copy exists. |
| Fixed 12-term handoff | `data/scientific/p36-unknown-biomarker-reconciliation-handoff.v1.json`, `catalog-reconciliation-handoff.ts` | Display-only. |
| Scientific Review route | `src/routes/mission.scientific-review.tsx` → `components/p36-scientific-review-workspace.tsx` → `p36-scientific-review.ts` | `buildScientificReviewDossiers` joins only the 12 crosswalk IDs; validation rejects other terms ("only the 12 handoff terms"). |
| Local worksheet ledger | `p36-scientific-review-ledger.ts` | SHA-256 chained, catalog-level, never synced. |
| Staged authorization | `supabase/pending/20261104000000_p36_scientific_authorization.sql` (+ rollback), `src/lib/p36-scientific-authorization.{functions,server}.ts`, `p36-scientific-authorization.ts`, `components/p36-final-authorization.tsx`, harness `scripts/verify-p36-scientific-authorization-pg.ts` | NOT applied. Append-only events table, SECURITY DEFINER append/list, membership-derived roles, independent recommendation by a different account, exact unit, stale/duplicate/conflict detection. Does not activate catalog. `term_id` constraint `^ubt-[0-9a-f]{8}$` already fits dynamic terms. |
| Activation | `data/scientific/catalog-extensions.v1.json` + `classifyWithGovernedExtensions` | Only code-reviewed APPROVED entries; app never writes it. |

## What Phase 1 adds
- `src/domain/health-intelligence/p36-dynamic-handoff.ts`
  - `buildDynamicHandoff(scope, requests)`: merges legacy 12 + local pending request terms for one exact mission/crew/provenance; legacy overlaps counted once; rejects cross-scope, approval-claiming, applied-change and tampered-ID requests; every term `LOCAL_ONLY`.
  - Canonical key = normalized label + exact unit + method + specimen (method/specimen recorded as `unrecorded` because intake does not capture them → permanent blockers until evidence exists).
  - `groupForProposal` / `draftBulkProposal`: groups by single candidate ID + exact unit; source-unvalidated, ambiguous, no-candidate and legacy-overlap terms are never selectable; output is always `perTermDecisionRequired: true, approved: false, activationAllowed: false`.
  - `buildSubmissionDraft`: value-free payload (labels, exact unit, term IDs, document hashes, evidence pointers). `transmitted: false`; nothing sends it.
- `tests/domain/p36-dynamic-handoff.test.ts`: 12 negative/regression tests.

Not changed: route, workspace, records, sync, PDFs, catalog, staged SQL, wording.

## Why Phase 1 stops here
Server visibility of dynamic terms requires a new table + RPCs. Shipping UI that lists 197 terms as "reviewable" without that would imply cross-device availability that does not exist. Per the contract's release gates, SQL is proposed below for owner review, not written to `supabase/pending/`.

## Proposed Phase 2 SQL (for review only — not staged, not applied)
```sql
create table public.p36_dynamic_handoff_terms (
  mission_id text not null references public.missions(id),
  crew_member_id text not null references public.crew_members(id),
  provenance text not null check (provenance in ('synthetic','real')),
  term_id text not null check (term_id ~ '^ubt-[0-9a-f]{8}$'),
  canonical_key text not null check (char_length(canonical_key) <= 600),
  original_labels text[] not null,
  exact_unit text not null check (char_length(exact_unit) <= 64),
  source_validation text not null check (source_validation in ('unvalidated','not_flagged')),
  source_document_sha256 text[] not null,
  evidence_pointers text[] not null,
  submission_id uuid not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  submitted_by uuid not null,
  submitted_role text not null check (submitted_role in ('crew_self','ground_medical')),
  received_at timestamptz not null default clock_timestamp(),
  received_seq bigint generated always as identity,
  primary key (mission_id, crew_member_id, provenance, term_id, payload_sha256),
  unique (submitted_by, submission_id)
);
-- No direct grants; writes via SECURITY DEFINER p36_dynamic_handoff_append_v1 (role from ACTIVE
-- mission_memberships for exact mission+crew; actor = auth.uid(); identical bytes = duplicate,
-- different bytes for same submission_id = conflict). Reads via p36_dynamic_handoff_list_v1
-- (ground_medical/researcher of the mission, or the crew member's own scope).
-- Triggers reject UPDATE/DELETE/TRUNCATE for every role.
```
Rollback: `drop function p36_dynamic_handoff_list_v1, p36_dynamic_handoff_append_v1; drop table public.p36_dynamic_handoff_terms;`

Then: disposable two-account harness (cross-mission deny, self-declared role deny, replay, duplicate, conflict, tamper, mixed unit, unvalidated), per-request sync state in UI, Scientific Review listing dynamic terms, wiring to the staged authorization ledger, generic "Researcher" wording.

## Owner-approval checkpoint
Reply with explicit approval of each, separately:
1. Stage the Phase 2 SQL above (plus rollback) in `supabase/pending/` and test it only in the disposable harness.
2. Build the Scientific Review UI that lists dynamic terms as LOCAL_ONLY with an explicit submit action (disabled until 3).
3. Apply the dynamic-handoff migration and `20261104000000_p36_scientific_authorization.sql` to live Cloud.
4. Upload the existing 197-term request.
None of these is implied by this phase.

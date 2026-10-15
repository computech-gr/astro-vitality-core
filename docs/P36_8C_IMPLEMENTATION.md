# P36.8C — Governed synthetic research decisions: implementation (STAGED, NOT DEPLOYED)

Status: staged only. Migration 0010 is NOT applied, no live decision has been executed and the app is not published. Deployment requires explicit owner approval. Backup status stays `OWNER_MANAGED_BACKUP_RISK_ACCEPTED` (not a verified backup).

## Staged files

- `supabase/pending/20261021000000_p368c_research_decisions.sql` — proposed governed migration 0010 (to be recorded as `drizzle/migrations/0010_p368c_research_decisions.sql` only on approval).
- `supabase/pending/20261021000000_p368c_research_decisions.rollback.sql` — manual, owner-run; refuses when any research decision exists.
- `tests/integration-pg/p368c-decisions.sql` and the P36.8C block in `scripts/verify-fv01-pg-integration.mjs` (sequential + real two-session concurrency).
- `tests/security/p368c-decision-contract.test.ts` — static contract.
- UI: `src/components/p368b-ground-medical-review.tsx`, `src/infrastructure/p368b-ground-medical-review.ts`.

## Migration 0010 contents

1. Batch columns `decision_idempotency_key`, `decision_payload_hash` (nullable) with format CHECK and partial unique index per reviewer membership.
2. Status CHECK superset adds `accepted_for_research`, `rejected_for_research`; receipt and review-state CHECKs require reviewer, `reviewed_at`, generated receipt, basis `locked_independent_ground_medical_membership` and idempotency evidence. Legacy `approved`/`rejected` stay in the CHECK but are unreachable.
3. `p36_validate_review_memberships()` keeps every 0006 check; adds the pending → research-decision transition, gated by the transaction-local flag `p36.decision_rpc = 'on'`, active Crew Self submitter and idempotency evidence. Quarantine path unchanged (and may not carry decision evidence).
4. Events: `event_type`/`resulting_status` extended, `resulting_status = event_type`, new `unique (batch_id)`. Event recorder and insert guard generalised to any terminal transition; trigger-depth check unchanged.
5. New `p36_items_no_delete` trigger (dedicated function `p36_reject_item_delete`).
6. RPC `p368_decide_ground_medical_batch(text, uuid, text, text, text, integer)` — security definer, pinned search_path, execute for `authenticated` only. Locks caller's active Ground Medical membership `FOR SHARE`, advisory lock on reviewer+key, replay/payload binding, batch `FOR UPDATE`, synthetic, not self-submitted, pending, exact item count; writes the batch (triggers create receipt + event) and a privacy-safe `p36.review_decision` audit row (no note, values, excerpts or filename). Returns `{batch_id, decision, decision_request_id, decided_at, replay}`.

## Deviations from the design

- Self-review is refused before the status check, so a self-submitted decided batch reports "self-review" rather than `already_decided`.
- Item delete protection uses a new dedicated function so the P36.4 rollback (which drops `p36_reject_item_mutation`) remains valid.
- The P36.8B UI contract test assertion "no decision controls" was narrowed: research decision controls are now intended; approve/`"approved"` remain forbidden.
- Closed (completed/aborted) missions are not additionally blocked; the design did not require it.
- The handoff doc was reformatted with Prettier to satisfy `format:check` (content unchanged).

## UI

After viewing values: optional note (max 500), "Accept for research" / "Reject for research", confirmation dialog (synthetic, research-only, no clinical meaning, final), one idempotency key per batch view, single in-flight guard, inline error, receipt panel and queue refresh. Only Ground Medical memberships see the panel; self-submitted and non-pending batches are never returned by the P36.8A reads.

## Remaining risks

Database owners can bypass triggers or set the session flag; the flag is defense in depth. Single reviewer decides alone; decisions are final with no appeal. Notes are stored in events (not audit metadata).

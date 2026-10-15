# P36.8C — Governed synthetic research review decisions: implementation design

Status: IMPLEMENTED AND STAGED (see P36_8C_IMPLEMENTATION.md). Not deployed. Migration 0010 requires explicit owner approval in a separate turn.

## Live baseline (read-only, 2026-10-15 20:18 UTC)

- 10 migration-history entries (0000–0009).
- P36 data: 1 batch (`pending_review`, synthetic), 8 items, 0 review events. Missions 3, memberships 10, audit events 212.
- Triggers present: `p36_review_membership_guard` (BEFORE INSERT/UPDATE batches), `p36_submission_fields_frozen` (BEFORE UPDATE batches), `p36_quarantine_audit` (AFTER UPDATE batches), `p36_items_immutable` (BEFORE UPDATE items, defined in 0007), `p36_events_insert_guard` (BEFORE INSERT events), `p36_events_immutable` (BEFORE UPDATE/DELETE events).
- All four P36 tables: forced RLS, restrictive deny-all, no browser grants.

## Decision semantics

| Decision                | Batch status            | Meaning                                                     |
| ----------------------- | ----------------------- | ----------------------------------------------------------- |
| `accepted_for_research` | `accepted_for_research` | Synthetic values are usable for research demonstration only |
| `rejected_for_research` | `rejected_for_research` | Synthetic values are excluded from research demonstration   |

The existing `approved`/`rejected` values are not used and get no transition. No status promotes data into mission events, the crew health index or any clinical record. Item `disposition` is not changed (items stay write-once).

## Migration 0010 (proposed, additive, single transaction)

1. **Batch status CHECK**: add `accepted_for_research` and `rejected_for_research` (drop and re-add `status` CHECK as a superset; existing row stays valid). Update `p36_decision_receipt_consistent` and `p36_review_state_consistent` so new statuses require a reviewer, `reviewed_at` and a generated receipt with basis `locked_independent_ground_medical_membership`.
2. **Batch `decision_idempotency_key text`** (nullable, format `^[A-Za-z0-9_-]{16,128}$`) and **`decision_payload_hash text`** (sha256 hex). Partial unique index on `(reviewed_by_membership_id, decision_idempotency_key)`.
3. **Trigger `p36_validate_review_memberships()`** (CREATE OR REPLACE): keep every existing frozen-provenance and lock check. Allowed UPDATE transitions become exactly:
   - `pending_review → quarantined` (unchanged: only when submitter revoked/disqualified);
   - `pending_review → accepted_for_research | rejected_for_research` only when submitter is still active Crew Self in scope, and only when the session flag `p36.decision_rpc = 'on'` (set locally by the decision RPC) is present.
     Any terminal status remains final. Receipt still generated in the trigger.
4. **Events CHECKs**: extend `event_type` and `resulting_status` to `quarantined | accepted_for_research | rejected_for_research` with `event_type = resulting_status`; `previous_status` stays `pending_review`. Keep `unique(batch_id, event_type)` and add `unique(batch_id)` so a batch has at most one decision event.
5. **`p36_record_quarantine_event()`** → generalised to record any `pending_review → terminal` transition using the same columns. `p36_validate_quarantine_event_insert()` generalised to match the batch's terminal status; depth check (`pg_trigger_depth() = 2`) unchanged. Immutable events trigger unchanged.
6. **Item protection gap**: add `p36_items_no_delete` BEFORE DELETE trigger on items (today only UPDATE is blocked) and change batch→event FK behaviour is already `restrict`.
7. **RPC `p368_decide_ground_medical_batch(p_mission_id text, p_batch_id uuid, p_decision text, p_note text, p_idempotency_key text, p_expected_item_count int)`**, `security definer`, `search_path = public, pg_temp`, `revoke all from public, anon`, `grant execute to authenticated`:
   - `auth.uid()` required; decision in the two allowed values; note ≤ 500 chars, plain text.
   - Lock caller's active `ground_medical` membership in the mission `FOR SHARE`; lock batch `FOR UPDATE`.
   - Batch must be same mission, synthetic, `pending_review`, submitter user ≠ caller, item count = `p_expected_item_count` (guards against stale view).
   - Idempotent replay: same reviewer + key + same payload hash returns the original receipt; same key with different payload → error; batch already decided → `already_decided` error without change.
   - Sets local session flag, updates the batch; triggers produce receipt and event; inserts a privacy-safe `audit_events` row (`p36.review_decision`, batch id, decision, no values, no note text).
   - Returns `{batch_id, decision, decision_request_id, decided_at, replay}` only.
8. **P36.8A list/detail RPCs** unchanged (pending only). Optional new read RPC for the reviewer's own decided history (metadata only, max 100) — listed but deferred unless approved.
9. Comments marking `approved`/`rejected` statuses as unused/not authorized.

Rollback (manual, owner-run only): restore 0006/0007 function bodies and constraints; only possible while zero rows use the new statuses, otherwise rollback would destroy evidence and is refused.

## UI changes (P36.8C UI, after migration acceptance)

- In the P36.8B panel, after viewing values: two buttons "Accept for research" / "Reject for research", required confirmation dialog stating synthetic/research-only/no clinical meaning, optional note, client idempotency key per batch view, single in-flight request, inline result with receipt id, queue refresh. Server function proxy optional; RPC call as signed-in user, never service role.
- Hidden/disabled for non-Ground Medical, for the submitter, and when the batch is no longer pending.

## PostgreSQL integration tests (disposable DB, new `p368c-decisions.sql`)

Accept and reject happy paths; event/audit rows match batch; items byte-identical before/after; refusals for anon, Crew Self, Operator, Researcher, revoked reviewer, other mission, self-review (same user via other membership), non-pending, quarantined, invalid decision, oversize note, stale item count; idempotent replay returns same receipt; key reuse with different payload refused; two-session concurrent conflicting decisions → exactly one succeeds; revocation-vs-decision both orders; direct table update without RPC flag refused; direct event insert/update/delete refused; item update/delete refused; no rows in mission_events/crew_health_record_index; existing 253 assertions still pass.

## UI acceptance criteria

Live as marketing@computech.gr in FV01-TEST-B on a NEW synthetic batch (the existing batch only if owner chooses): decision recorded once, retry shows same receipt, batch leaves the queue, Crew Self/Operator see no decision controls, values unchanged.

## Security risks

- Database owner/superuser can still bypass triggers and forge evidence (unchanged from B10).
- Session-flag gate is defense-in-depth, not authentication; real authority is the RPC's locked membership checks.
- Single Ground Medical reviewer can decide alone; no second-reviewer or appeal path.
- Decisions are final; mistaken decisions need a future governed appeal design.
- Notes are free text; kept out of audit metadata but stored in events.
- Live test on the only existing synthetic batch is irreversible.

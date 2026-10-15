# P36.8C — Governed synthetic review decisions: schema compatibility gate

Status: DESIGN / PREFLIGHT ONLY. No migration or write RPC authorized.

## Confirmed blocking constraints in deployed migration 0006

- `p36_validate_review_memberships()` explicitly rejects every UPDATE except `pending_review` -> `quarantined`, and then only when the submitter is revoked or disqualified.
- `p36_biomarker_review_events.event_type` is constrained to `quarantined`; no approved/rejected evidence event can be written.
- `p36_biomarker_review_items` are immutable via `p36_items_immutable` and must stay so.
- P36.8A read RPCs expose only `pending_review` synthetic batches, and are read-only.
- Existing `approved` and `rejected` status strings in the batches CHECK constraint are NOT evidence that those transitions are authorized.

## Required governed design before P36.8C deployment

1. Define review semantics: choose `accepted_for_research` / `rejected_for_research` rather than medical diagnosis or clinical approval, or document why alternate labels are appropriate. No clinical promotion.
2. Extend the membership trigger using an explicit, tightly scoped transition policy without weakening frozen provenance, reviewer independence, revocation locks, and synthetic-only checks.
3. Extend append-only decision events to record allowed decision types, exact previous/resulting statuses, actor identity, request ID, server time, mission, and optional bounded note. Never allow rewriting historical events.
4. Expose exactly one authenticated, server-authorized decision RPC: active Ground Medical, same mission, independent of submitter, immutable reviewed items, batch pending, mission-scoped, idempotent/replay-safe, transactional event and audit write.
5. Explicitly refuse Crew Self, Researcher, Mission Operator, anonymous, revoked reviewer, cross-mission, self-review, and double/conflicting decisions.
6. Provide migration rollback strategy, PostgreSQL integration tests (including concurrency), and a read-only preview of the SQL diff and expected production record changes.
7. Require owner approval in a separate turn before deploying migration 0010 or executing a live decision.

## Scope of this patch

This patch adds a regression guard and the documented gate only. It intentionally does not change database schema, authorization, RPCs, UI, or live data. P36.8B publication and live reviewer acceptance remain separate pending gates.

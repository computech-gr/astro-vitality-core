# P36.2B8 — Review Audit Trail & Quarantine Governance

**Staged only.** Replace the existing unapplied `supabase/pending/20261017000000_p36_biomarker_review_foundation.sql` in place. Do not apply to the shared Cloud database or publish.

## Implemented

- New `p36_biomarker_review_events` append-only table with a unique quarantine event per batch, mission, reviewer/submitter identity snapshots, source fingerprint, note and timestamp.
- A database `AFTER UPDATE` trigger writes an event atomically with an authorized pending-to-quarantined transition. An event write failure rolls back the transition.
- `BEFORE UPDATE OR DELETE` trigger refuses event modification or deletion. Forced RLS, deny-all policy, no browser grants, no API, no `SECURITY DEFINER` functions.
- The original B7 eligibility checks remain in force. No clinical, scientific approval, or observation promotion is enabled.

## Explicit limitations and next decisions

- No appeal, re-review, rejection or approval path. Design these as separate audited records after governance review; do not edit the original quarantine decision.
- No active service or browser writer. The future privileged writer must use a scoped transaction and verify membership at decision time, including concurrent revocation.
- The trigger's timestamp comes from `reviewed_at` of the guarded batch; a future service should also record server receipt time, request ID and actor authorization evidence.
- Privileged schema owners can alter triggers; separate operational audit and migration permissions remain necessary.
- No automatic quarantine on membership deactivation; pending records require an explicit independent reviewer action.

## Mandatory disposable-DB tests

1. All governed migrations plus staged SQL, twice for idempotence; preserve existing 155 checks.
2. Valid revoked-submitter quarantine creates exactly one matching event, in the same transaction.
3. Rejected quarantine and failed audit insertion leave batch and event unchanged.
4. Direct event UPDATE/DELETE rejected, including privileged application role; browser SELECT/INSERT denied.
5. Duplicate event rejected; cross-mission and same-user reviewer rejected; active submitter cannot be quarantined.
6. Revocation during request, concurrent reviewers, event retention and service audit controls must be evaluated before deploying any write service.
7. Full `bun run check`, no test deletion, no publication or shared database migrations.

**Gates:** FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED. Preserve `MISSION_TEST` and its linked astronaut.

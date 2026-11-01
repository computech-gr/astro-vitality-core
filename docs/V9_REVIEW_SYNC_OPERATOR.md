# v9 Cloud Review Sync — operator instructions (PENDING owner approval)

Status: **staged, not applied.** The migration lives in `supabase/pending/` and has not been run
against the project database. Until it is applied, the app shows
`Cloud review sync unavailable: migration required` and keeps every review event on the device.

## What it adds

`supabase/pending/20261101000000_v9_review_sync.sql` (additive only):

| Object                                                  | Purpose                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `review_sync_attestation_events`                        | Append-only Ground Medical attest/revoke metadata                 |
| `review_sync_correction_events`                         | Append-only correction audit intents (IDs + reason, no values)    |
| `review_sync_is_ground_medical`, `review_sync_can_read` | Server-side scope checks                                          |
| `review_sync_append_v1`                                 | Caller-scoped write RPC (`auth.uid()` actor, Ground Medical only) |
| `review_sync_list_v1`                                   | Caller-scoped paginated read (Ground Medical or the crew member)  |

Nothing stores measured values, units, documents, excerpts or AI text.

## Security properties (verified on a disposable PostgreSQL 17)

`FV01_PG_SOCKET_DIR=<disposable socket dir> bun run verify:v9-review-sync-pg` — 38 scenarios:
anon/no-JWT denied; actor must equal `auth.uid()`; Ground Medical only for an active membership on the
exact mission (mission-wide or bound to that crew member) **and** an active crew assignment; crew_self
reads only their own crew; researcher, operator and cross-mission users denied; direct INSERT/UPDATE/
DELETE denied; UPDATE/DELETE/TRUNCATE blocked by triggers even for privileged roles; identical replay =
duplicate, different content = conflict, second correction of one original = conflict; future decision
times rejected; revocations must supersede an attestation already in the cloud; audit event per write.

## Applying (only after owner approval)

1. Review the SQL and this document.
2. Apply the file byte-for-byte through the Lovable migration tool (it moves to `supabase/migrations/`).
3. Sign in as a Ground Medical reviewer, open Unified Intake → Stored observations, choose a
   **synthetic** scope, attest one record, press **Sync reviews to cloud** and confirm
   `Synced 1`. Sign in on a second browser and press the button again to confirm the event arrives.

## Rollback

`supabase/pending/20261101000000_v9_review_sync.rollback.sql` drops only the v9 objects. It refuses to
run while either table has rows. To roll back with data: export both tables first
(`select * from public.review_sync_attestation_events` / `..._correction_events`), then run the
rollback inside a transaction with `set local review_sync.allow_destructive_rollback = 'on';`.
Local device ledgers are unaffected by a rollback.

## Known limitations

- Correction **values** never leave the device; other devices see that a record was corrected (IDs,
  reviewer, reason) but not the new value.
- Attestation event IDs are 32-bit deterministic hashes scoped per mission/crew/provenance; a collision
  is reported as a conflict, never overwritten.
- A revocation of another reviewer's attestation can only sync after that attestation was synced.

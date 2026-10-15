# P36.5 — Select All and Saved Synthetic Review History

## Changes
- `Select All` / `Deselect All` operates only on current exact-match candidates. Selection changes reset manual confirmation and preview. Duplicate-metric rejection remains enforced by the existing workflow.
- Existing P36.4 submission becomes visibly **Save reviewed synthetic measurements to Cloud**. It does not claim success until the server RPC returns success. Saved batches remain `pending_review`.
- A new read-only **Astronaut saved reviews — by observation date** section retrieves at most 100 synthetic batch summaries, ordered newest observation date first. It shows date, creation time, number of markers, review status and batch ID; not file contents or values.
- The history server function uses the signed-in user's bearer token and a dedicated database RPC, which re-checks `auth.uid()`, active Crew Self mission/crew membership and submitter user snapshot. No direct table read grants.

## Deployment gates
- New `supabase/pending/20261019000000_p365_synthetic_review_history.sql` is **staged, not deployed**.
- Must first independently approve and apply P36.2B10, P36.4, then P36.5 in that order. Shared Cloud DB serves production and preview. Do not apply without owner approval and backup/rollback plan.
- History and Save remain locked when `P36_CLOUD_SUBMISSION_ENABLED` is not true. Do not publish or enable automatically.
- Run full throwaway PostgreSQL migration chain, role and cross-mission negative tests, revocation tests, UI tests, typecheck, lint and build. Test actual Crew Self UI separately.
- This does not create a storage folder for original PDFs. It creates a **logical per-astronaut review history** based on mission/crew/user scope. No medical interpretation, approval, or clinical activation.

## Open gates
FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED. Database owner forgery remains outside guarantees.

# P36.8A — Ground Medical read-only review foundation

This patch adds **two staged, read-only PostgreSQL RPCs**. It is not a complete reviewer workflow and does not add a reviewer screen or review decisions. The existing P36.7 synthetic Crew Self submission remains unchanged.

## Deployment gate

1. Confirm the target is the **Lovable Cloud database**, never the separate Supabase project. Record the owner's existing `OWNER_MANAGED_BACKUP_RISK_ACCEPTED` decision accurately; no backup is claimed.
2. Inspect actual live migration history and existing P36 batch/item schema; verify `ground_medical`, `mission_memberships.user_id`, `active`, `mission_id`, and `auth.uid()` behavior. Abort on drift.
3. Run regression tests and full quality/security checks. Review SQL privileges and `security definer` search paths.
4. With explicit owner approval for this specific migration, apply `drizzle/migrations/0009_p368a_ground_medical_readonly.sql` through Lovable Cloud governance. Do not apply both copies. Record the actual migration identifier (do not assume sequential history numbers).
5. Test **live** as a separate active Ground Medical account in FV01-TEST-B: pending synthetic batch visible, exact 8 values accessible read-only. Crew Self, anonymous, another mission, inactive reviewer, and the submitter's own user must be denied. Test revoked membership and mission isolation. Do not use service role for acceptance.
6. Confirm zero new/modified batches, items, decisions and audit records. Do not publish a reviewer UI until live authorization tests pass.

## API

- `p368_list_ground_medical_pending(p_mission_id text)`: oldest-first pending synthetic batch metadata, maximum 100, same mission, excludes current user's own submissions.
- `p368_get_ground_medical_batch(p_mission_id text,p_batch_id uuid)`: metric IDs, values, units and excerpts of an eligible pending batch. No original PDF is returned.

Both functions require an authenticated active `ground_medical` membership in the requested mission, locked `FOR SHARE` during the transaction. All existing tables retain their deny-all policies; only authenticated RPC execute grants are added.

## Next patch

P36.8B will add the reviewer UI and server-side authenticated proxy after these live RPC tests. P36.8C will separately design governed reviewer decisions, with independent audit, revocation/concurrency and explicit scientific sign-off; never auto-approve or promote to clinical records.

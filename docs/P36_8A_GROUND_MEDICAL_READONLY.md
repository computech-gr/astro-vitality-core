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

## Deployment record (2026-10-15)

- Owner-approved; backup status `OWNER_MANAGED_BACKUP_RISK_ACCEPTED` (no verified backup claimed).
- Preflight repeated immediately before deployment: unchanged (9 history entries, no P36.8A functions, 1 synthetic pending batch / 8 items, 0 review events, no browser table grants).
- Applied once as governed migration `drizzle/migrations/0009_p368a_ground_medical_readonly.sql`, SHA-256 `516d21846204d2d219ef15b647c90ce7e590c6aae8436c9cf487f4c0fee60f49` (identical to staged file).
- Live post-check: 10 history entries; both RPCs security definer with pinned search_path, execute only for authenticated/service_role; signed-out calls refused (42501); forced RLS and zero browser table grants unchanged; batch/item/event/membership/mission/audit counts unchanged.
- Revocation, cross-mission, self-review, role and anonymous denials verified only in disposable PostgreSQL 17.9 (`tests/integration-pg/p368a-readonly.sql`, 20 scenarios). Live memberships were not altered.
- Live authenticated Ground Medical acceptance: PENDING owner test.

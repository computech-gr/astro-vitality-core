# FV-01.4.3 Multi-Role Security Hardening (F1–F3)

Status: **APPLIED TO PRODUCTION as governed migration 12 (2026-10-14).** The role compatibility matrix, independent Ground Medical approval, recipient binding and single-Operator restriction are **owner-approved**.
FV-01-13 remains OPEN. Final Security Gate remains BLOCKED.

## Findings addressed

- **F1 (High):** self-issued invite acceptance; self-reactivation of sensitive memberships.
- **F2 (Medium):** no separation of duties between roles in one mission.
- **F3 (Low):** Ground & Research Console picked the first membership.

## Proposed role compatibility matrix (same mission, both active)

|                  | Crew Self     | Mission Operator | Ground Medical | Researcher |
| ---------------- | ------------- | ---------------- | -------------- | ---------- |
| Crew Self        | one crew slot | allowed          | forbidden      | forbidden  |
| Mission Operator | allowed       | —                | forbidden      | allowed    |
| Ground Medical   | forbidden     | forbidden        | —              | allowed    |
| Researcher       | forbidden     | allowed          | allowed        | —          |

Different missions: no restriction.

## Objects (`supabase/migrations/20261015000000_fv0143_multirole_hardening.sql`)

- New: `mission_roles_compatible`, `mission_role_conflict` (not callable by browser roles), `enforce_membership_role_compatibility` + trigger `trg_membership_role_compatibility`, `approve_mission_invite`.
- Replaced: `accept_mission_invite`, `create_mission_invite`, `set_mission_membership_active`, `get_mission_operations_workspace`.
- Additive columns on `mission_invites`: `approval_state` (default `not_required`), `approved_by`, `approved_at`; check constraint.
- Backfill: any open, unclaimed Ground Medical invite becomes `pending`. Acceptance additionally requires `approved` for every Ground Medical invite independent of the column default.

Denials return `status: rejected` and write audit rows (`mission_invite_acceptance_denied`, `mission_invite_approval_denied`, `membership_reactivation_denied`) without invite codes.

## Ground Medical approval

Approver must be a different person from the inviter, hold active Mission Operator or Ground Medical in the same mission, and cannot later accept that invite. Single use (pending → approved). No tokens.
**Single-Operator missions without Ground Medical:** onboarding stays blocked. Unblocking requires a platform capability that is not available today: a separately authenticated, independently authorized approval authority (for example an organisation-level medical director identity provisioned outside the mission). Interim alternative: onboard a second Operator first (that invite must be accepted by a different person), who can then approve.

## Residual risks

- Two colluding Operators can still approve each other's Ground Medical invites for third accounts they control; mitigated by audit evidence only.
- Operator + Researcher coexist (aggregate-only data).
- Pre-existing forbidden pairs (none in production at preflight) would not be revoked; they are blocked from reactivation.

## Verification

`FV01_PG_SOCKET_DIR=<disposable socket> FV0143_INCLUDE_PENDING=1 node scripts/verify-fv01-pg-integration.mjs`
Result: 103 assertions PASS (28 existing FV-01 + 75 FV-01.4.3) on disposable PostgreSQL 17.9. Without the flag the original 28 still pass.
Rollback script verified to restore the original functions and remove the trigger while keeping all memberships.

## Recipient binding (FV-01.4.3 final pre-production review)

**Finding (before this addition):** an approved Ground Medical invite was a bearer credential. Anyone holding the code (other than the inviter and approver) could redeem it, so approval did not authorize a specific person.

**Correction (staged):**

- `bind_mission_invite_recipient(invite_id, email)`: an active Operator of the mission binds the invite to exactly one platform account whose email is **confirmed** in the identity store (`auth.users`). Unknown, unconfirmed or ambiguous addresses all get the same "recipient identity not verified" error, so the response does not reveal whether an address exists. The inviter cannot bind themselves. Only Ground Medical invites can be bound; Crew Self, Operator and Researcher invites are unchanged.
- Binding or re-binding always resets approval to `pending` and clears the previous approver, so a recipient cannot change after approval.
- `approve_mission_invite(invite_id, expected_recipient_email)`: the approver states the identity they reviewed. Approval is refused if no recipient is bound, the binding has changed (`recipient_mismatch`), the approver is the recipient, or the approver is the inviter. Approval is single-use.
- `accept_mission_invite`: a Ground Medical invite is redeemed only by the bound, approved account. Any other account presenting the code is refused (`wrong_recipient`), the code is treated as leaked and revoked, and the attempt is audited.
- Existing pending Ground Medical invites have no recipient, so they cannot be approved until one is bound. Any open approved invite without a recipient is reset to pending.
- The operations workspace shows the bound email to Operators of that mission only. It never shows codes.

**Remaining identity-assurance and collusion risks:**

- Identity assurance equals the platform's email confirmation. A compromised mailbox or account inherits the binding. Stronger assurance (MFA, or an organisation directory) is a platform capability that is not available today.
- An Operator can bind the invite to an account they control (other than their own); only the independent approver's out-of-band check of that person prevents this.
- Two colluding mission members (Operator + Operator or Operator + Ground Medical) can still onboard an account of their choice. Detection relies on the permanent audit records (`mission_invite_recipient_bound`, `mission_invite_approved`, `mission_invite_accepted`).
- Revoking on a wrong-recipient attempt is fail-closed. A holder of a leaked code can therefore cancel a legitimate invite (denial of service); the Operator re-issues it.

## Production migration checklist (owner-gated, nothing executed yet)

1. Owner approves: the role matrix, the approval and recipient-binding model, and blocked single-Operator Ground Medical onboarding.
2. Owner confirms a fresh production backup.
3. Read-only preflight, all must hold: zero users with a forbidden active pair in one mission; zero open unclaimed Ground Medical invites (or list them, since they will become pending and unbound); `auth.users` has `email` and `email_confirmed_at`; function signatures match the governed chain; record counts for missions, memberships, invites, events, index rows and audit entries.
4. Re-run `FV01_PG_SOCKET_DIR=… FV0143_INCLUDE_PENDING=1 node scripts/verify-fv01-pg-integration.mjs` (expect 103 PASS) and the full `bun run check`.
5. Move the staged file into `supabase/migrations/` with a governed marker. Update the governed count from 11 to 12 in `migration-policy.mjs`, `verify-p19.mjs` and the release docs. Apply it with the migration tool byte-for-byte.
6. Post-apply read-only check: the new functions and trigger exist; counts unchanged except new approval columns; existing memberships unchanged; the two synthetic events and index rows unchanged.
7. Publish the screen changes (only after step 6).
8. Live check without writes: `/mission/operations` and `/mission/ground` (Ground & Research Console) load. Any functional live test of invitations needs separate owner authorization.
9. Undo if needed: `supabase/pending/20261015000000_fv0143_multirole_hardening.rollback.sql`. It is verified in the disposable database and keeps the new columns, marked deprecated.

## Production release evidence (2026-10-14)

- Backup/restore: confirmed by the owner with Lovable Support before release. No timestamp or restore reference was provided to the agent; none is recorded here.
- Migration file: `supabase/migrations/20261015000000_fv0143_multirole_hardening.sql`, SHA-256 `4103442ad4cfad19daf747c3ebe2f3920a4d8e72761805bc9a8d24a408b6eb5f`, byte-identical to the tested staged file (its header comment still reads "STAGED"; left unchanged to keep the fingerprint). Applied once via the migration tool (recorded as `drizzle/migrations/0004_fv0143_multirole_hardening.sql`, identical apart from the trailing newline). Governed chain: 12 migrations.
- Preflight: 0 forbidden active pairs; 0 open Ground Medical invites; 6 affected functions identical to the tested baseline.
- Isolated tests: 103/103 PASS (28 FV-01 + 75 FV-01.4.3); rollback restores the original 4 functions and removes the trigger with memberships unchanged. Full `bun run check`: 236 pass, 0 fail.
- Post-migration: all 9 functions identical to the tested build; 7 invite columns, check constraint and enabled trigger present; privileged invite functions callable by signed-in users only (not anon, not sandbox_exec); `mission_role_conflict` not callable by browser roles. Counts unchanged: 3 missions, 7 memberships (7 active), 5 invites (1 open, 0 pending/bound), 3 crew, 3 assignments, 2 events, 2 index rows, 57 audit entries (the 2 added since the earlier 55 are operator `mission_operations_workspace_read` page views before the release). Invite, membership and event content fingerprints unchanged.
- Rollback (manual only): `supabase/pending/20261015000000_fv0143_multirole_hardening.rollback.sql`.

## Production deployment status (FV-01.4.5 record)

- Status: **APPLIED and PUBLISHED.** Governed migration 12 `supabase/migrations/20261015000000_fv0143_multirole_hardening.sql` was applied exactly once and the screen changes were published afterwards.
- The migration file's header comment still reads "STAGED, NOT APPLIED". That text is historical: it describes the file's state when it was reviewed. The SQL is intentionally kept byte-for-byte (SHA-256 `4103442a…6eb5f`) and must not be edited, renamed, reapplied or deleted. This document is the authoritative deployment record.
- The rollback script remains in `supabase/pending/` and is manual only.
- FV-01-13 remains OPEN; the Final Security Gate remains BLOCKED.

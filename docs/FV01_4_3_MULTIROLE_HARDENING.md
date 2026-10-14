# FV-01.4.3 Multi-Role Security Hardening (F1–F3)

Status: **IMPLEMENTED LOCALLY AND VERIFIED IN A DISPOSABLE DATABASE. NOT APPLIED TO PRODUCTION. NOT PUBLISHED.**
The role compatibility matrix is a **proposal awaiting final owner approval**.
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

## Staged objects (`supabase/pending/20261015000000_fv0143_multirole_hardening.sql`)

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
Result: 78 assertions PASS (28 existing FV-01 + 50 FV-01.4.3) on disposable PostgreSQL 17.9. Without the flag the original 28 still pass.
Rollback script verified to restore the original functions and remove the trigger while keeping all memberships.

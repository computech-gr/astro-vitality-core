# FV-01.4.2A — Controlled Live Mission Setup: Approval Gate

Status: **PRE-FLIGHT ONLY / PHASE B NOT APPROVED**.

## Established Phase A evidence

- Owner confirmed A3 (two independent browser profiles) and A7 (independent sign-out).
- Owner screenshots: TEST A `security@computech.gr` and TEST B `support@computech.gr` each returned count=0 for `missions`, `mission_memberships`, `crew_members`, `mission_events`, `audit_events` through the normal signed-in browser client.
- R1, R2, R3, R5: PASS for the tested read-only count operations only. R4: INCONCLUSIVE because `mission_events` was empty.
- Restricted Mission & Crew Operations UI: owner-attested PASS for both accounts.
- Temporary diagnostic removed and clean production version published; owner still needs to confirm in a signed-in session that the panel is absent.
- FV-01-13 `sandbox_exec`: OPEN. Final security approval: BLOCKED.

## Implementation references in this repository

- `src/components/mission-operations.tsx` contains the operator workspace and mission/invite UI.
- `src/infrastructure/mission-operations.ts` calls `create_mission_operation`, `get_mission_operations_workspace` and other mission-scoped RPCs.
- `src/infrastructure/mission-identity.ts` contains the mission invite flow.
- `supabase/migrations/20260920235600_p20_mission_crew_operations.sql` defines mission operations RPCs.
- `supabase/migrations/20260920233000_p20_mission_identity_invites.sql` defines invite/bootstrap-related logic.

## Required read-only preflight before any Phase B approval

1. Verify the deployed clean release on canonical `https://mitochondria.edocinfo.com`, including signed-in absence of the temporary diagnostic. No redeployment unless necessary.
2. Confirm the existing authorized Mission Operator can access Mission & Crew Operations using their **own normal browser session**; do not impersonate or request credentials.
3. Review the **actual database RPC authorization** for `create_mission_operation`, `create_mission_invite`, invite acceptance, and membership assignment; verify operator scope, `SECURITY DEFINER` search path and grant boundaries. Static code inspection is not live enforcement proof.
4. Read-only confirm existing production state and name/code availability for `FV01-TEST-A` and `FV01-TEST-B`. Do not list or disclose private mission details or credentials in reports.
5. Identify immutable audit/event traces, cleanup/deactivation strategy, role/invite expiry, and any risk of affecting the real mission. Do not promise deletion of append-only evidence.
6. Prepare exact execution order and expected observations: operator creates synthetic mission A and B; role-bound invitations are issued only after separate approval; TEST A/B accept their respective invites through the standard UI; cross-mission isolation and denial of mutations are checked. No mission creation, invite issuance or membership changes during preflight.
7. Record blockers and a precise **GO / NO-GO recommendation**. A GO recommendation is not authorization to execute.

## Separate owner approval required

The next phase can create permanent synthetic records. Do **not** create either mission, assign roles, issue invites, accept invites, change real mission records, or deploy changes until the owner explicitly authorizes Phase B and the exact operations. No privileged account impersonation, no test shortcuts, no service-role keys, and no direct production SQL writes.

## Required reporting

- Clean release verification: PASS / FAIL / NOT VERIFIED.
- Existing operator UI and authorization readiness: PASS / FAIL / NOT VERIFIED.
- Code/RPC authorization review findings, with references.
- Proposed synthetic mission codes and exact role/invitation flow.
- Permanent audit-trail implications and rollback/containment limitations.
- Phase B decision: **NOT APPROVED** pending owner confirmation.
- FV-01-13: **OPEN**; final security approval: **BLOCKED**.

# Mission & Crew Operations

`/mission/operations` completes the governed lifecycle behind Mission Identity. It is intentionally operator-only and does not turn authentication into mission access.

## Security model

- All mission, crew, membership, and invitation mutations are executed through `SECURITY DEFINER` RPCs that authenticate and authorize the caller inside PostgreSQL.
- `mission_crew_assignments` is RLS-enabled, RLS-forced, and has no direct `public`, `anon`, or `authenticated` table privileges.
- Browser code never receives or uses a service-role credential.
- A mission operator may manage only a mission where they hold an active `mission_operator` membership. Creating a new mission additionally requires established operator standing and atomically makes the creator the first operator of the new mission.
- The final active operator of a mission cannot be deactivated.
- Crew-self membership is unique for an active mission/crew slot.
- Crew-self invites are only valid for crew members actively registered in that exact mission. A crew ID from another mission is rejected.

## Lifecycle

Mission state transitions are forward-only: `planning -> active -> completed|aborted`, with `planning -> aborted` also allowed. Completed and aborted missions are terminal in v20.11.0.

Crew registry entries are mission-scoped and use `candidate`, `active`, or `inactive`. Before an active crew member can be marked inactive, any active `crew_self` membership for that mission/crew pair must first be deactivated.

## Operator workflow

1. Sign in at `/mission/identity` with an active mission-operator membership.
2. Open `/mission/operations`.
3. Create or select a mission.
4. Add crew members to the mission registry and activate them when ready.
5. Issue one-time role-bound invites. `crew_self` invitations require an active crew registry row.
6. Deactivate/reactivate memberships without deleting history.
7. Review audit evidence through the governed ground/audit paths.

## Bootstrap boundary

The first production mission operator is still a controlled provisioning responsibility outside the public browser flow. The application does not implement a "first signed-in user becomes admin" shortcut. Once one governed operator exists, that operator can create subsequent missions and the system atomically grants the creator operator membership on the new mission.

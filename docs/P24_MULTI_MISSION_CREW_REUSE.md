# P24 — Multi-mission crew identity reuse

## Existing schema
`crew_members` is a global crew identity table. `mission_crew_assignments` is a mission-scoped join table. The patch reuses these tables instead of introducing a second identity namespace.

## Operator workflow
1. Sign in as an active Mission Operator on **both** missions.
2. Navigate to **Mission > Mission & Crew Operations** (existing menu item).
3. Select the target planning/active mission, then select a different managed source mission.
4. Choose an existing crew identity and assign it to the target mission.
5. The new target assignment is **CANDIDATE** until explicitly activated. A separate target-mission crew-self invite is required.

## Security and invariants
- The server validates active operator access to both source and target missions; client filters are not authorization.
- No crew record is duplicated; no existing health records, memberships, invites, or events are copied or reassigned.
- Mission data remain mission-scoped. Longitudinal cross-mission health comparisons are **not** authorized or implemented by this patch.
- Existing P23 mission record-index migration is not re-run.
- Duplicate target assignment fails, as do same-mission assignment and closed target missions.
- Each successful assignment writes an audit event in the target mission.
- Source membership does not grant Crew Self access to the target mission.

## Validation
Run `node scripts/verify-p24-multi-mission.mjs`, existing mission-operations verifier, tests, typecheck and build in Lovable. Then perform authenticated two-mission operator testing. No live database migration or browser test was performed while preparing this ZIP.

## Scientific intelligence boundary
P24 changes **only** mission identity assignment. No biomarker association, time-series prediction, or clinical inference is added. Future intelligence must use measured temporal alignment, personal baselines, quality gates, and evidence approvals, never directionality alone.

# P36.2B6 — Emergency revocation and immutable provenance (staged)

This patch **replaces** the pending P36 SQL in place. **Do not deploy** to the shared Cloud database. No browser write path, import endpoint or approval workflow is introduced. Synthetic-only remains enforced.

## Changes

- Remove the P36 membership-change guard that prevented urgent `active=false` deactivation or role revocation when historical review records exist.
- Preserve attribution using `submitted_by_user_snapshot` and `reviewed_by_user_snapshot` UUID columns. The review trigger verifies the snapshots against membership user IDs and prevents changing an already recorded submitter or reviewer identity.
- Every new review insert/update continues to require active Crew Self submitter and active independent Ground Medical reviewer when reviewer is present. A revoked member cannot be used for a new decision.
- Membership **deletion** remains blocked by `ON DELETE RESTRICT` for referenced records. Immediate access revocation is by deactivation, not deletion.

## Known limitations and acceptance requirements

- The `pending_review` record remains pending after membership revocation; no automatic mutation of review state is attempted. A future privileged approval service must recheck active role, mission, user identity and pending state atomically at approval time and require an independent authorized reviewer. No approval service exists today.
- This design is staged-only and must be tested in a disposable PostgreSQL database with the full prior migration chain. Verify deactivation succeeds for referenced submitters/reviewers; pending review cannot be approved by a revoked actor; existing snapshots are unchanged; cross-mission and same-user attempts fail; browser roles cannot read/write.
- Historical membership reassignment and role changes require separate audit governance. A future production design should prohibit reassignment of membership user IDs, and retain an append-only security event for revocation.
- The legacy P36.2B5 membership-change test was revised to reflect this security correction.
- `MISSION_TEST` and its actual linked crew member are reserved for the final synthetic PDF demo; do not create new identities.

**Gates:** FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED.

# P48 — Crew Self preflight findings (Stage A, read-only)

Date: 2026-10-31. No users, memberships, invites, records, migrations, RLS or
publishing were changed. Live database inspection used read-only queries only.

## Verifier

`node scripts/verify-p48-crew-self-readiness.mjs`: 6/6 PASS (static only).

## Exact data path (inspected)

1. `/mission/companion` → `getCloudMissionContext()` reads
   `mission_memberships` for `auth.uid()` with `active = true`; only
   `role = 'crew_self'` rows with a `crew_member_id` become selectable scopes.
2. `loadCrewScientificEvidence(missionId, crewMemberId)` re-checks that scope,
   then `loadRecordedMissionData()` selects `mission_events` for the caller's
   mission IDs and keeps only rows matching the selected mission **and** crew.
3. Server enforcement is RLS `mission_events_scoped_select`: ground_medical of
   the mission, or an active crew_self membership whose `crew_member_id`
   equals the row's. The client filter is a second layer, not the guard.
4. Writes go only through `ingest_mission_event` (security definer, caller
   must be the active crew_self of that crew, ground_medical, or operator for
   non-medical operational events). Events and audit are append-only.
5. Revocation path: `set_mission_membership_active` (mission_operator only).

## Isolation evidence (disposable PostgreSQL 17, live migrations only)

`fv01-setup.sql` + `fv01-sequential.sql`: 25/25 PASS, including "active crew
self reads own events only" (another crew's events exist in the same mission),
"deactivated crew self cannot read events", "deactivated crew self cannot read
crew identity" and "invite re-binding rejected".

Live-database impersonation is not possible with the read-only tool, so no
claim is made about live RLS beyond the identical policy definitions.

## Live inventory (counts only)

| Mission        | Crew Self accounts | Crew events | Event classification         |
| -------------- | ------------------ | ----------- | ---------------------------- |
| MISSION_TEST   | 1                  | 0           | — (protected)                |
| FV01-TEST-A    | 1                  | 53          | 52 medical_sensitive (PPG)   |
| FV01-TEST-B    | 1                  | 24          | 23 medical_sensitive (PPG)   |
| MITO_DEMO_2026 | 1                  | 74          | 74 medical_sensitive, manual |

Crew Self accounts do exist, but none holds data classified `synthetic`.
Camera PPG rows may be a real person's measurements. One Cloud instance serves
preview and the published app, so no non-production Cloud environment exists.

## Gaps found (not fixed in Stage A)

- Companion checks membership only on load; after revocation an open page
  keeps already-loaded data until reload/refocus (new reads fail closed).
- The full `verify-fv01-pg-integration.mjs` run stops at pending
  `20261028000000_medical_demo_activation_guard.sql` (harness drift); the
  production-migration path above passes.

## Stage B plan (requires owner approval)

1. Environment: preferably an isolated draft backend; otherwise a dedicated
   new mission `P48_SYNTHETIC_DEMO` in production, never MISSION_TEST or the
   existing missions.
2. Through existing app flows as mission_operator: create two crew members
   ("Synthetic Crew A/B"), create two crew_self invites, bind each to a
   dedicated test email, and accept each from its own account.
3. Each crew account ingests clearly labelled `classification: synthetic`
   observations via `ingest_mission_event` (no admin client, no RLS bypass).
4. Browser acceptance: A sees own trends and 7/30/90-day/source filters; A
   requesting B's mission/crew IDs gets zero rows at the API; signed-out,
   operator and researcher accounts fail closed; then operator deactivates A
   and A's next load returns nothing.
5. Optional code change: re-check membership on focus/visibility in the
   companion so revocation also clears an open page.

Approvals needed: environment choice; creating 2 accounts + 2 crew members +
1 mission; writing synthetic events (append-only, cannot be deleted); a
browser session for each test account; the optional revocation code change.

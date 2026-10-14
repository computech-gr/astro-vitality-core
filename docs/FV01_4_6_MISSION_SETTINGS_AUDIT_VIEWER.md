# FV-01.4.6 — Mission Settings & Secure Mission Audit Log

## Status

| Capability        | Status                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Mission Settings  | Implemented and published. No database change (reuses `update_mission_operation`).                        |
| Mission Audit Log | Screen implemented and published; its database reader is **staged, awaiting owner approval** (see below). |

Until the reader is approved and applied, the Audit Log section states that it is waiting for an approved database update and shows no records.

## Phase 1 audit (read-only, 2026-10-14)

- FV-01.4.5 was published before this work started.
- `update_mission_operation` (security definer, fixed search path) already enforces: signed-in user, active Mission Operator of the mission, name 3–120 characters, forward-only lifecycle (planning → active/aborted, active → completed/aborted), immutable end after close, research snapshot freeze on close, and an audit entry. It cannot change the mission code or ID, and it cannot clear a start date. If no end date is sent on a non-closing update, it clears the end date; the new screen therefore always resends it.
- `audit_events`: append-only triggers; an RLS read rule exists for Ground Medical and Operators, but browser accounts have **no SELECT grant**, so the browser cannot read the table. Metadata can contain mission names, crew display names and mission codes. A safe reader therefore needs a new, narrow, server-side function: a migration.

## Navigation

Mission Operations (`/mission/operations`) → section links **Mission Settings** (`#mission-settings`) and **Mission Audit Log** (`#mission-audit-log`). Both sections render only inside the Operator workspace (after the "Operator membership required" gate) and follow the mission selected there. No new routes.

## Role permissions

| Role             | Mission Settings  | Mission Audit Log |
| ---------------- | ----------------- | ----------------- |
| Mission Operator | View and edit     | View (read-only)  |
| Ground Medical   | Not shown; denied | Not shown; denied |
| Researcher       | Not shown; denied | Not shown; denied |
| Crew Self        | Not shown; denied | Not shown; denied |

The server re-checks the Operator role on every save and every audit read. Hiding the screens is convenience only.

## Mission Settings — user instructions

1. Sign in, open Mission Operations, select the mission.
2. Read-only: mission code, mission ID, current status. Editable: name, status (only allowed next steps), start and end (UTC).
3. Change values; errors appear immediately (name length, end after start, start cannot be cleared, lifecycle).
4. Save settings. Closing a mission (completed/aborted) asks for confirmation; it is permanent.
5. Discard changes restores the saved values. Closed missions are read-only.

## Mission Audit Log — user instructions

1. In Mission Operations, go to Mission Audit Log.
2. Filter by UTC date range (inclusive), action, outcome (Success/Refused) and search text (action or target type). Apply filters.
3. Select a row to expand details. Load older records pages 25 at a time.
4. There are no edit, delete or export controls.

## Security design (staged reader)

`supabase/pending/20261016000000_fv0146_mission_audit_viewer.sql` — `public.get_mission_audit_log(...)`:

- Stable (read-only) security definer function with fixed `search_path = public, pg_temp`. It writes nothing, not even its own audit row.
- Requires a signed-in user and an active Mission Operator membership in the requested mission; any other mission is refused.
- Only the requested mission's rows are returned. Keyset pagination, limit 1–100, validated filters, search capped at 80 characters.
- Redaction: details are limited to an allow-list (`previous_status, status, role, kind, classification, expires_in_hours, external_ref_present, bootstrap_one_time, creator_operator, reason, policy, outcome`), scalars only. It never returns codes, hashes, emails, names, payloads, target IDs or actor account IDs. Actors appear as "self" or a per-mission pseudonymous `member-xxxxxxxx`, plus the role.
- EXECUTE is revoked from public and anon, and granted to authenticated only. No table grants or policies change.
- The browser adds a second redaction step (`src/domain/mission-audit/audit.ts`).
- Rollback (manual only): `supabase/pending/20261016000000_fv0146_mission_audit_viewer.rollback.sql` (drops the function; no data touched).

## Database changes

- Production: **none applied.**
- Staged: 1 new read-only function (governed migration 13 once approved). It changes 0 rows.

## Tests

- Isolated PostgreSQL 17.9: 131/131 PASS (103 existing + 28 FV-01.4.6). These cover operator access, cross-mission refusal, Ground Medical/Researcher/Crew Self/unauthenticated denial, anon EXECUTE denial, redaction of codes/emails/hashes/payloads/names/IDs, filters, half-open UTC ranges, search, empty results, pagination cursor, limit bound, invalid input, refusal of audit update/delete, and the function's settings.
- Unit tests: `tests/identity/fv0146-settings-audit.test.ts` (17). These cover validation, lifecycle, closed read-only, UTC handling, end-date preservation, duplicate-submit guard, client redaction, error classification, read-only viewer, operator-only rendering, and the FV-01.4.5 restriction.

## Known limitations

- The Audit Log shows no records until the staged reader is approved and applied.
- The start date can be changed but not cleared (server rule). The mission code and ID are immutable.
- Ground Medical keeps its existing table-level read rule, but has no browser grant and no viewer.
- Signed-in screens were not exercised in production (no test writes allowed).

## Production publication evidence

See the final report of this release. FV-01-13 remains OPEN; the Final Security Gate remains BLOCKED.

# P48.3 — Stage B implementation plan (read-only findings)

Date: 2026-10-31. Nothing was created, written, migrated or published. Live
inspection used read-only queries (function definitions, policies, counts).

## Verifier

`node scripts/verify-p48-3-stage-b-readiness.mjs`: 6/6 static checks PASS.

## Backend isolation options (inspected)

| Option                                    | Status                                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing draft "FV01 Security Validation" | Uses the **live** database. Not isolated.                                                                                                                                                                                                                                               |
| New draft with its own test database      | The platform can label a draft's database as "its own test database, isolated from live data", but this is only known after creating a draft. Unverified: whether all live migrations are applied there, and how its auth/email behaves. Requires approval to create a draft (no data). |
| Separate Test/Live environments           | Not present: one Cloud instance serves preview and the published app.                                                                                                                                                                                                                   |
| Disposable PostgreSQL harness             | Available and already used (Stage A, 25/25 PASS). Not a real authenticated backend, so it cannot satisfy Stage B acceptance.                                                                                                                                                            |

## Existing workflows (inspected)

- **Mission:** `create_mission_operation` (caller must already be a
  mission_operator somewhere; creates the mission and the caller's operator
  membership). UI: Mission Operations.
- **Crew:** `create_mission_crew_member` + active `mission_crew_assignments`.
  UI: Mission Operations.
- **Crew Self invite:** `create_mission_invite(role 'crew_self', crew id)`.
  No approval and no recipient binding for crew_self (binding/approval apply
  only to ground_medical), so the code is a 24-hour bearer secret. The inviter
  cannot accept their own invite; one active crew_self per crew member.
- **Acceptance:** `accept_mission_invite` from the recipient's own signed-in
  account (Mission Identity page, email/password or magic link sign-up).
- **Revocation:** `set_mission_membership_active` (mission_operator only).
  UI: Mission Operations membership list.
- **Evidence intake:** `ingest_mission_event` (security definer; caller must be
  the active crew_self of that crew, ground_medical, or an operator for
  non-medical operational events only). Accepts `classification: synthetic`.
  Rows are append-only (no update/delete) and indexed into
  `crew_health_record_index`.
- **Reads (RLS):** `mission_events_scoped_select` and
  `crew_health_record_index_scoped_read` allow ground_medical of the mission or
  the caller's own active crew_self crew only. Operators and researchers cannot
  read crew events; `crew_members` is visible to own active membership or
  ground/operator roles.

## Blockers

1. **No approved synthetic intake path in the app.** Every existing app write
   path (live dashboard, readiness assessment, bone history, offline runtime)
   labels events `medical_sensitive`; the synthetic generator is local only.
   Unified intake stays offline by rule. Stage B needs one of:
   - (a) a small, reviewed crew-self-only "synthetic demo reading" form that
     calls the existing `ingest_mission_event` RPC as the signed-in crew member
     with `classification: synthetic`, a `synthetic:true` source id and the
     companion's payload shape (code change, no migration) — **recommended**;
   - (b) calling the same RPC from a browser session of each test account
     (no app change, but not an "approved intake workflow").
2. **Two dedicated test identities** with team-controlled mailboxes are
   needed; email confirmation and sign-up settings were not read, so their
   behavior is unverified.
3. **Isolation is unverified** until a draft is created and its database label
   checked.
4. **Records are permanent** in the live database: events, audit rows,
   invites and memberships cannot be deleted; the mission can only be closed.
5. Edge and a real phone are not available in this sandbox; those steps need a
   person.

## Safest Stage B sequence (each step approval-gated)

1. **Environment.** Create one new draft and read its database label.
   If isolated: run Stage B there (verify migration parity first with
   read-only checks). If not isolated: abandon it and use the live database
   only with explicit approval of the inventory below.
2. **Inventory (live fallback).** 1 mission `P48_SYNTHETIC_DEMO` ("P48
   Synthetic Crew Self Demo — not medical data"); 2 crew members "Synthetic Crew
   A/B"; 2 crew assignments; 2 new test accounts; 2 crew_self memberships
   (+ the operator's own membership); 2 invites; ~12 synthetic observations
   (6 per crew, spanning >90 days and 2 sources) + 12 index rows; ~15 audit
   events. No existing mission, account or reading is reused.
3. **Onboarding** through Mission Operations / Mission Identity only: owner
   creates mission and crew; issues each invite and hands the code to that
   account only; each account accepts while signed in as itself.
4. **Synthetic intake** via blocker 1 option (a) or (b), as each crew member.
5. **Acceptance with real sessions** (minted per account only after approval):
   A sees only A's readings and 7/30/90-day/source filters match stored rows;
   A's direct API reads for B's crew id return 0 rows; operator, signed-out
   (and an optional researcher) see none; owner deactivates A, A's next read
   returns nothing and tab return clears the open view (P48.2).
6. **Close** the mission (`update_mission_operation` status) to stop further
   writes; record counts and outcomes only — no values or credentials in logs.
7. **Manual:** Edge and a physical phone, including notification permission.

## Approvals required

- Create a draft to check for an isolated database.
- Environment choice (isolated draft, or live with the inventory above).
- Two dedicated test accounts and confirmation the team controls their email.
- Mission, two crew members, invites and memberships.
- Permanent synthetic observations, and the intake method (a) or (b).
- Browser sessions for each test account; operator revocation of crew A.
- Closing the mission after the test.

## Remaining limitation

While a tab stays continuously visible, revocation is not reflected until the
next return, sign-in change or scope change; RLS still blocks new reads.

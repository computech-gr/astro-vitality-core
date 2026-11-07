# P36 final controlled installation checkpoint — 7 November 2026

## Result

- **Step 3 permission remediation: PASS (live installation and effective-ACL verification).**
- **Step 4 authorized roster: PASS (live installation, definition and security-catalog verification).**
- **Metadata Handoff activation: NOT AUTHORIZED; runtime acceptance remains unverified.**

Owner authorization was supplied in `MITOCHONDRIA_P36_-_APPROVE_STEP_3_REMEDIATION_pasted.md`. Only its two operations were executed, sequentially against the existing managed project backend. Steps 1–3 were not replayed. No admission, feature flag, membership, scientific decision, catalog, metadata upload or publication changes were made.

## Exact bytes and migration history

Hashes were checked immediately before submission, after installation against generated migration files, and against the live Drizzle migration journal. Both new submissions preserved every byte, including the remediation's absent final LF and the roster's present final LF.

| Journal ID | Installed file                                           | Recorded SHA-256                                                   | Status                                                |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| 17         | `0016_p36_dynamic_handoff_tool.sql`                      | `79286f4cd359e793cb9c773301fd212963726690913eff815f819c77841f7e78` | Existing; not replayed                                |
| 18         | `0017_p36_handoff_executor_insert_remediation.sql`       | `c10352f4679b2dd4b692f3bb6f75cfe1c8dbb1c18346865f2463dcef28ab82b2` | Existing; prior owner-acknowledged LF discrepancy     |
| 19         | `0018_p36_dynamic_authorization_tool.sql`                | `796ded9d0d7341a417555d1e1852edf0528203842bec555d9e1e20242b582434` | Existing; independently verified prior LF discrepancy |
| 20         | `0019_p36_authorization_executor_insert_remediation.sql` | `90d89ad74bf6e5f163a6f2cd1cac14cbc6761d2a235960e325ead539cf2f1d2b` | New; exact approved bytes                             |
| 21         | `0020_p36_authorized_crew_roster.sql`                    | `d4d410a42933af335b3dfa48f077793cd6f763b77338fad4369a6009408faca3` | New; exact approved bytes                             |

The closed-admission initialization was a previously authorized data operation, not a new migration. Its final readback remains exactly one singleton row, `handoff_open=false`, `authorization_open=false`.

## Step 3 effective security

On `p36_dynamic_source_validation` and `p36_dynamic_authorization_events`:

- `sandbox_exec`: SELECT retained; INSERT, UPDATE, DELETE and TRUNCATE effectively false.
- `service_role`: SELECT retained; INSERT, UPDATE, DELETE and TRUNCATE effectively false.
- `anon` and `authenticated`: SELECT and all listed writes effectively false.
- `has_any_column_privilege(..., 'INSERT')` false for all four roles on both tables; no column-specific ACLs exist.
- Both table owners remain `postgres`; RLS remains enabled.

These PostgreSQL effective privilege functions include inherited rights. Direct-write denial was verified through the effective table/column ACLs; **no live INSERT probe was attempted**, so there was no risk of adding a row if permissions were wrong. Prior disposable direct-write-denial and rollback evidence remains documented in `P36_STEP3_REMEDIATION_VALIDATION.md`; a fresh rerun was blocked because the explicit disposable socket was unavailable.

A before/after preservation fingerprint for database default ACLs, role memberships, all pre-existing P36 function definitions/ACLs, P36 RLS flags, named P36 triggers and every other public table/sequence ACL remained identical: `89b6d719cd1f8273a003bb9ac9f77b94`. The same fingerprint matched after Step 4 when excluding only its newly created roster function. This verifies the inspected catalogs, not every row in unrelated tables.

## Step 4 effective security and scope

Live function readback matches the approved roster body:

- Owner `postgres`; STABLE SECURITY DEFINER; `search_path=public,pg_temp`.
- Effective EXECUTE: `authenticated=true`; `anon=false`, `service_role=false`, `sandbox_exec=false`.
- No PUBLIC execute grant; no broader table policies or grants added.
- Requires a non-null authenticated caller with an active membership in the requested mission in Crew Self, Ground Medical or Researcher role.
- Returns only active crew assignments in that exact mission.
- Crew-bound membership returns only its bound crew. Mission-wide Ground Medical/Researcher membership can enumerate that mission's active crew IDs and display names by design.
- A null-bound Crew Self membership returns no crew rows; it does not gain mission-wide visibility.

Scope validation here is the independently reviewed installed SQL definition and catalog permissions, **not a fresh real-account RPC execution**. Existing disposable verifier covers own-crew, mission-wide Researcher, cross-mission denial, anonymous denial and inactive assignments. Independent review also identified concurrent revocation as requiring runtime evidence: this read function does not serialize revocation with row locks. Do not claim instantaneous cancellation of an already-started read.

## Final installed objects

Five RLS-enabled `postgres`-owned tables:

1. `p36_dynamic_admission`
2. `p36_dynamic_handoff_submissions`
3. `p36_dynamic_handoff_terms`
4. `p36_dynamic_source_validation`
5. `p36_dynamic_authorization_events`

Two `postgres`-owned received-sequence objects remain unchanged. `sandbox_exec` retains their existing SELECT/USAGE privileges, intentionally not revoked by this INSERT-only remediation.

Eleven P36 functions: `p36_dynamic_scope`, `p36_dynamic_admission_reject_delete`, `p36_dynamic_handoff_append_v1`, `p36_dynamic_handoff_list_v1`, `p36_dynamic_reject_mutation`, `p36_dynamic_auth_has_role`, `p36_dynamic_auth_event_hash`, `p36_dynamic_auth_append_v1`, `p36_dynamic_auth_list_v1`, `p36_dynamic_auth_reject_mutation`, `p36_dynamic_crew_roster_v1`. All live owners remain `postgres`; pre-existing function ACLs and definitions were preserved, not rewritten.

Final row counts: admission 1; submissions 0; handoff terms 0; source validations 0; authorization events 0. Existing local 12/197-term requests were not read or uploaded.

## Remaining activation checkpoints

1. Separate owner authorization is required before opening Metadata Handoff admission or changing any deployment feature flag. This installation approval does not authorize either.
2. Actual deployed feature-flag values and deployed server revision were not inspected or changed in this operation; do not infer activation readiness from the installed SQL.
3. Fresh isolated real-auth Ground Medical/Researcher and Crew Self runtime acceptance remains unavailable; no synthetic claim substitutes for it. The disposable permission harness could not rerun because its required socket was missing.
4. Independently provisioned source-validation receipts, Ground Medical recommendations, independent Researcher decisions and governed catalog activation remain separate gates. Installation creates none of them.
5. Confirm roster revocation behavior and malformed membership cases with independent runtime evidence before claiming those acceptance cases.
6. Hosted exact-commit CI and platform compatibility are not certified by these catalog checks. The latest available managed compilation signal was `build OK`.

No further live action is authorized or scheduled by this report.

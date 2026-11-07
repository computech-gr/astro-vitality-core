# P36 dynamic workflow — authoritative migration sequence

This document supersedes the migration order in `docs/P36_FINAL_UX_ACTIVATION_CHECKLIST.md` and
`docs/P36_PRODUCTION_ACTIVATION_CHECKLIST.md`. Those files are kept as history. Nothing here has been
applied to production; every production step still needs explicit owner authorization.

## How the order was worked out (from the SQL itself)

| File                                              | Depends on                                                                                           | Creates                                                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261107000000_p36_dynamic_handoff.sql`          | existing `auth.uid()`, `missions`, `crew_members`, `mission_memberships`, `mission_crew_assignments` | `p36_dynamic_admission` (closed by default), `p36_dynamic_handoff_submissions`, `p36_dynamic_handoff_terms`, `p36_dynamic_scope`, append/list RPCs |
| `20261107010000_p36_dynamic_authorization.sql`    | the handoff file (`p36_dynamic_scope`, `p36_dynamic_handoff_*`, `p36_dynamic_admission`)             | `p36_dynamic_source_validation`, `p36_dynamic_authorization_events`, auth append/list RPCs                                                         |
| `20261104000000_p36_scientific_authorization.sql` | none of the above                                                                                    | separate fixed-12-dossier ledger                                                                                                                   |

The fixed-dossier file is **not** a prerequisite of either dynamic file (no reference to any of its
objects). Requiring it first, as the final UX checklist did, was wrong. It is a separate, optional
feature that needs its own decision.

## Tool-compatible execution sequence (supersedes forward execution below)

### Live stop checkpoint — 7 November 2026

At 07:43 UTC the owner acknowledged the Step 1 remediation's two recorded hashes and authorized resumption. Step 2 succeeded at `2026-11-07 07:43:26.293809+00`; exactly one singleton has `handoff_open=false`, `authorization_open=false`, `change_note='initial: closed'`. Step 3 committed as `drizzle/migrations/0018_p36_dynamic_authorization_tool.sql`, history id 19. STOP: executor direct INSERT remains on both authorization tables. Also the assistant omitted one of the approved source's two trailing LFs: approved `8c038a0a797441a0245092dbaa5a14567ef39ba88884d8b0a2ce4be4d01b0a4d`, submitted/recorded `796ded9d0d7341a417555d1e1852edf0528203842bec555d9e1e20242b582434`; SQL statements are identical. No replay/history rewrite or Step 4 execution. Prepare `20261107010001_p36_authorization_executor_insert_remediation.sql` for separate approval; do not execute it. Historical statuses below are superseded by this paragraph.

At 07:41 UTC the owner-approved INSERT revocation was applied as `drizzle/migrations/0017_p36_handoff_executor_insert_remediation.sql`. Effective permissions pass and unrelated catalog fingerprint is unchanged. However the submitted SQL included one final newline absent from the approved source: live/recorded hash `c10352f4679b2dd4b692f3bb6f75cfe1c8dbb1c18346865f2463dcef28ab82b2` differs from approved `11c08f81f112f6b32234c2cb0a1f55143082678e4d36fa56f9ae1c811005c6ef`. The difference is exactly one trailing LF; SQL tokens are identical. Stop and request owner acknowledgment/resume authorization. Do not replay or rewrite either committed migration. Admission remains uninitialized; Steps 2–4 remain unexecuted. This status supersedes the preparation-only remediation status below.

Step 1 is now committed as `drizzle/migrations/0016_p36_dynamic_handoff_tool.sql`, exact approved hash; never replay it. Steps 2–4 were stopped before execution. The live default ACL grants `sandbox_exec` direct INSERT on the three new handoff/admission tables. A preparation-only INSERT revocation is staged in `20261107000002_p36_handoff_executor_insert_remediation.sql` (SHA-256 `11c08f81f112f6b32234c2cb0a1f55143082678e4d36fa56f9ae1c811005c6ef`), with separately gated restoration. It has not been applied. Platform compatibility is unverified; approval and successful effective-ACL readback are required before initialization. The unchanged authorization SQL will inherit the same executor INSERT grants on its two future tables, so Step 3 must not be treated as security-cleared merely because handoff remediation passes. See `P36_EXECUTOR_PERMISSION_REMEDIATION.md` for the complete checkpoint.

Prepared replacements only; **no live execution is authorized**. Original forward SQL and rollback bytes remain unchanged.

1. Apply `supabase/pending/20261107000000_p36_dynamic_handoff.tool.sql` through the migration tool in its managed transaction. SHA-256: `79286f4cd359e793cb9c773301fd212963726690913eff815f819c77841f7e78`.
2. Verify schema, trusted function ownership, grants/RLS and zero admission rows. Missing admission denies writes. Then execute the single statement in `supabase/pending/20261107000001_p36_closed_admission.initialize.sql` through the supported data tool, **under separately explicit installation authorization**. SHA-256: `46c4d8ac23c65d9d5d5ded5d4c609da734441e9e5bcbe11ed58addbd9fc05002`. Verify exactly one singleton with both switches false and `change_note = 'initial: closed'` before proceeding. This is initialization, not activation.
3. Apply `supabase/pending/20261107010000_p36_dynamic_authorization.tool.sql` through the migration tool. SHA-256: `8c038a0a797441a0245092dbaa5a14567ef39ba88884d8b0a2ce4be4d01b0a4d`. Verify new objects, immutable triggers, grants/RLS, trusted ownership and both switches false.
4. Apply `supabase/pending/20261107020000_p36_authorized_crew_roster.tool.sql` through the migration tool. SHA-256: `d4d410a42933af335b3dfa48f077793cd6f763b77338fad4369a6009408faca3`. Verify caller-scoped RPC permissions and closed admission.

The three DDL copies remove only outer transaction wrappers; the handoff copy additionally moves its exact singleton INSERT into step 2. No function bodies, defaults, grants, policies, triggers or scientific checks change. Do not apply original and replacement copies cumulatively. Original forward hashes below are retained as traceability, not alternative tool execution instructions.

Each DDL step is atomic through the migration tool's transaction; initialization is one atomic data statement. The four-step sequence is **not** atomic as a whole. Equivalent failure safety is fail-closed: before initialization no singleton exists and appends refuse; after initialization both switches are false. Any failed check stops the sequence with earlier committed schema retained. Never automatically retry initialization or execute a rollback; inspect first. Existing rollback scripts remain valid and require separate execution authorization/compatible transport.

Disposable PostgreSQL validation: 149 assertions, including failure injection after every DDL statement, initialization failure/replay, original/replacement catalog/ACL/RLS/default/function/trigger/index/constraint equivalence, missing-row handoff/authorization denial, trusted local ownership, base-row preservation and guarded rollbacks. Existing 38 SQL security checks also pass against replacements. Tests emulate tool transactions; they do not attest live transport acceptance or genuine browser authentication. Full report: `docs/P36_TOOL_COMPATIBLE_PREPARATION_RESULTS.md`.

## Original approved sequence (traceability only)

Forward (once, in this order, each file atomically, bytes must match the hashes):

1. `supabase/pending/20261107000000_p36_dynamic_handoff.sql` — SHA-256 `c36ed38b8836f5c8cb0a906735e1ec6a8748145df393ab7029312434275ff83d`
2. `supabase/pending/20261107010000_p36_dynamic_authorization.sql` — SHA-256 `47c3498fad113acec0c9776636ae1378adbcdcf5b719cfc7c4e4d98124d33b06`
3. `supabase/pending/20261107020000_p36_authorized_crew_roster.sql` — SHA-256 `79cbac14e37717c98977f199974df0575449050cee38ec0612703567e01b66f0`; narrow authenticated active-assignment/name read for mission-wide reviewers. Depends on the handoff scope model; does not change table RLS or write admission.

After the sequence is applied, admission stays **closed**: no writes are accepted even with application
flags on. Opening admission is a separate trusted-SQL step
(`update public.p36_dynamic_admission set handoff_open = true, change_note = '…'`, later
`authorization_open = true`) and needs its own authorization.

Rollback: first remove the read-only roster RPC with `20261107020000_p36_authorized_crew_roster.rollback.sql` (SHA-256 `8de32cf5b790e6782c0fff0375598dfc7cd845b9cec4b1f744a072d3256dfc11`; no evidence is removed). Then, only when the feature tables are verified empty, in reverse order:

1. `20261107010000_p36_dynamic_authorization.rollback.sql` — `4af6a908698a20ec792c56214fa09cf6001b1ea7b556650b35104f5ca98c5704`
2. `20261107000000_p36_dynamic_handoff.rollback.sql` — `985188b27aa0d7747848cdb2907a37961a52e44d59b3b5ff89385340bd2bdd4a`

Both rollbacks refuse when any record exists. The handoff rollback also refuses while the
authorization objects are still installed, so it cannot be run out of order. If records exist,
**close admission instead** (retaining disable). Records stay intact and remain readable.

Never apply:

- the whole `supabase/pending/` directory;
- pending files that are byte-identical to committed Drizzle migrations (a second copy);
- legacy/standalone/split v3 alternatives as if they were cumulative;
- `20261104000000_p36_scientific_authorization.sql` just to satisfy the older checklist.

## Changes since the previous NO-GO hashes

- Closed-by-default admission switch (`p36_dynamic_admission`) checked by both append RPCs. Granting EXECUTE no longer admits writes on its own.
- Append RPCs take `FOR SHARE` locks on the authorizing membership and crew assignment, so a concurrent revocation is serialized and honored.
- An approval must cite the source receipt's own `validation_reference` in `validationEvidenceRefs`.
- The handoff rollback has an ordering guard and drops the admission table.

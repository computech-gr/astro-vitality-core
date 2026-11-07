# P36 tool-compatible replacement preparation

## Result

Preparation/testing only. No live migration, data initialization, admission/flag change, account/membership change, catalog activation, local-record upload or publication occurred. Original approved SQL and rollback files are byte-identical.

The supported migration tool requires no outer BEGIN/COMMIT and accepts DDL, not singleton seeding. The replacement handoff DDL therefore excludes the exact original singleton INSERT, which is preserved in a separately hashed plain data statement for the supported data tool. No DML is disguised inside a function/DO block or mislabeled as a backfill. Initialization must be explicitly authorized together with installation before any live call.

## Exact execution approval artifacts

All paths are under `supabase/pending/`:

| Step | File                                                 | SHA-256                                                            | Transport                         |
| ---- | ---------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------- |
| 1    | `20261107000000_p36_dynamic_handoff.tool.sql`        | `79286f4cd359e793cb9c773301fd212963726690913eff815f819c77841f7e78` | Migration tool transaction        |
| 2    | `20261107000001_p36_closed_admission.initialize.sql` | `46c4d8ac23c65d9d5d5ded5d4c609da734441e9e5bcbe11ed58addbd9fc05002` | Atomic single-statement data tool |
| 3    | `20261107010000_p36_dynamic_authorization.tool.sql`  | `8c038a0a797441a0245092dbaa5a14567ef39ba88884d8b0a2ce4be4d01b0a4d` | Migration tool transaction        |
| 4    | `20261107020000_p36_authorized_crew_roster.tool.sql` | `d4d410a42933af335b3dfa48f077793cd6f763b77338fad4369a6009408faca3` | Migration tool transaction        |

Step 2 inserts the identical singleton using unchanged defaults (handoff false, authorization false, initial closed note). Before step 2, missing-row admission checks fail closed; after step 2, false-switch checks fail closed. No interval admits writes. If initialization fails, stop before step 3. Duplicate initialization fails rather than overwrites a row. If any later step fails, earlier committed steps remain: stop, inspect and retain closed admission. This is equivalent **write-denial failure safety**, not whole-sequence atomic rollback or byte-equivalence to the original first transaction.

Read back schema, effective ACLs/RLS, function owner/search paths, immutable triggers, admission and migration history after each DDL. Read back exactly one closed singleton after initialization. A trusted deployment owner and no untrusted CREATE on public are prerequisites. No scientific receipts are seeded. Original and replacement copies must never both be applied.

## Validation

- `tests/integration-pg/p36-tool-compatible.py`: **149 assertions PASS** on PostgreSQL 17.11. Failure injected after every DDL statement; transaction rollback left no partial schema/ACL changes. Original/replacement relations, columns/defaults, constraints, indexes, functions/bodies/owners, triggers, policies and ACLs matched after each successful stage; existing base rows matched.
- Missing singleton denies handoff and authorization; authorization checked with synthetic and real provenance. Failed initialization leaves zero rows; caller-role initialization denied; successful initialization produces the exact closed singleton; replay leaves one row.
- Empty reverse rollbacks pass; wrong-order and nonempty receipt rollback refuse without data/schema loss. Original rollback bytes are unchanged.
- `P36_TOOL_COMPATIBLE=1` existing SQL verifier: **38 checks PASS**, including 197-term synthetic fixtures, caller scope, independent decision rules, source-receipt checks, retry/conflict, revocation, roster and retaining disable. These test-only receipts/decisions exist solely in the disposable database.
- Full regression suite: **1,199 PASS, 0 FAIL**, 12,550 assertions. Lint: **0 errors, 12 existing warnings**. Security boundary audit and formatting check: **PASS**. Managed preview compilation: **build OK**. Disposable PostgreSQL was stopped after testing.

Local SQL tests use an explicit socket-only disposable database and simulated JWT claims. They are not real account acceptance, hosted migration-tool execution, production base-schema equivalence or current-replacement exact-commit CI. Full successful catalog equality does not erase intermediate missing-row state; that state was separately tested as denied.

## Remaining blockers and next approval

1. Explicit owner approval of all four exact artifacts above on the existing shared Lovable Cloud backend serving mitochondria.edocinfo.com, including the initialization data statement (not activation), is required. Earlier approval covered different hashes only.
2. Live tool acceptance and effective deployed security/ownership must be verified during authorized execution. A rejected tool call or failed readback stops installation, without workaround or silently transformed SQL.
3. New preparation has no exact-commit hosted CI attestation yet. Prior candidate CI does not certify these changes. Existing private/external release-evidence gates remain blocked and are not waived.
4. Metadata activation requires separate approval after all steps pass. Global admission accepts real as well as synthetic provenance; synthetic UI selection is not a database-enforced restriction. Scientific authorization and promotion stay closed.

Proposed approval: authorize only the four exact hashed artifacts in order on the existing shared backend; verify every step; keep handoff_open=false and authorization_open=false and all flags unchanged; stop on any failure; no publication, local metadata upload, membership change, scientific authorization or catalog activation. Recovery limitations previously acknowledged remain applicable.

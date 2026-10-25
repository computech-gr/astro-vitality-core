# Medical v3 schema / synthetic seed separation

## Decision

Prepared and disposable-validated; **production execution is not authorized**. Original approved bundle and rollback remain byte-identical. No production migration, seed, AI, durable approval, real-data processing, scientific activation or deployment occurred. P3663, P3664 and P20 official-rules release gates remain BLOCKED. Independent staging is not requested.

## Exact approval artifacts

| Artifact                                                                    | SHA-256                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `supabase/pending/20261027000000_medical_v3_synthetic_schema.sql`           | `2024f9023006ba4b8134919f1efb7c8f7c550a19668681d5a6a673b53dc6affc` |
| `supabase/pending/20261027000000_medical_v3_synthetic_seed.sql`             | `39f18901515d5adbf8942bd88b20723b8ded215d53f07f2d076f3cbcb51c6343` |
| `supabase/pending/20261027000000_medical_v3_synthetic_disable.rollback.sql` | `40f19bba27c5ba8b42535416ab1eefa22d40b34e29b952f6b91ce6580cab1a21` |

Original bundle: `3370a34b95e5f8385d587481af4763c8e6541d80c8a0ee81b393cc62409b48cc`; original rollback: `1f33ee387540ea8087d44cb3b86400316d6f5578d100505b6aa1cafeaabb97e7`.

Schema excludes outer transaction wrappers and all executed fixture inserts, retaining five tables, 15 final hardened functions, RLS, inherited privilege revocation, four authenticated RPCs, advisory quota locks, and unconditional persistent-review denial. Inserts inside function definitions remain definition-only, not seed operations. Until seeding, authority and quota requests fail closed.

Seed is one data-only privileged PostgreSQL DO statement, not a new function, application endpoint or service-role grant. It serializes with schema/disable, holds scope and data locks, requires the exact mission/crew/membership and empty tables, pins all 15 function definitions/owners/search paths/permissions, verifies RLS and persistence denial, then inserts exactly one source, two observations and two explicitly non-human test receipts. Final checks are inside the same statement. No updates, deletion, role creation or silent repair. Repeat seeding is refused, preserving existing bytes.

Exact observation literals remain `synthetic-v3-hr-001` / 62 bpm / `2026-10-01T10:00:00Z` and `synthetic-v3-hr-002` / 66 bpm / `2026-10-02T10:00:00Z`, metric `cv-001`, domain cardiovascular; receipts retain `2026-10-24T21:06:00Z`. Evidence canonicalization/catalog/source hashes are unchanged.

## Tool compatibility: explicit limitation

The managed migration tool documents its atomic transaction and rollback on failure; submit schema verbatim only after approval. The managed data-query tool is the authorized server-side data mechanism, but its documentation does **not establish acceptance of procedural DO with locks**. PostgreSQL statement atomicity is executable and tested; acceptance by this exact hosted tool is **UNVERIFIED** and was not probed through a production call. Do not claim the tool blocker fully resolved. Seed approval is conditional on that transport accepting the exact one-statement artifact; if rejected, stop with no fallback, no split inserts, no privilege relaxation and no added seed RPC. A different transport/artifact requires another owner-approved scope/fingerprint.

## Recovery and separately authorized disable

1. **Schema failure:** managed tool rolls back schema and migration journal; verify absence of all five tables/15 functions before an authorized retry. Never combine this alternative with older pending bundles.
2. **Schema committed, seed not run or transport rejected:** schema persists, fixtures remain empty, authority/quota fail closed. No AI activation. After read-only checks, retry only the separately approved identical seed if transport compatibility is established. Do not rerun schema.
3. **Seed statement failure:** PostgreSQL rolls back all seed inserts and releases transaction locks; schema remains. Inspect empty counts and prerequisites; retry only with approval, no repair writes.
4. **Uncertain response/lost receipt:** read back exact counts, IDs, values, timestamps, catalog/source/evidence integrity and ACLs. Exact completed seed means no rerun. Unexpected/partial/conflicting rows mean STOP and retain evidence; no deletions or invented recovery.
5. **Disable after schema-only or seeded completion:** obtain separate explicit authorization for the rollback hash above; keep synthetic server capability off, wait at least 35 seconds and confirm no active lease. Apply disable through atomic schema tool. It verifies expected definitions (including the exact disabled resolver for repeatability), revokes snapshot/evidence/new quota access, replaces authority with an empty resolver, retains every fixture/quota/history row and leaves only caller-owned release available. It is repeatable, non-destructive and does not refund quotas. No schema drop.
6. **Re-enable after disable:** intentionally not supplied or authorized. Seed cannot reactivate disabled authority; fresh review, a fingerprinted recovery change and owner approval are required.

## Executed validation

- Live **read-only** compatibility: PostgreSQL 17.6; exact scope prerequisites ready; zero demo tables/functions before work. No production write.
- Disposable PostgreSQL 17.9: **477 split/security/recovery assertions**; **30 governance**, **51 synthetic completion**, **305 FV01 authorization/concurrency** assertions: all pass (863 total). No live AI; server provider response simulated.
- **565 tests pass**, zero fail; security audit pass; lint zero errors / 13 existing warnings.
- Scientific/security static checks: **99/102 pass**; only genuine P3663, P3664 and P20 rules gates blocked and unchanged.
- Fresh full-scope Trivy, including development/unfixed dependencies: **0 vulnerabilities, 0 secrets**.
- Touched-file formatting pass. Automatic preview build OK; no manual typecheck/build or exact-new-commit CI claim.

Coverage includes hostile inherited PUBLIC/anon/authenticated/service-role defaults; all five table CRUD/TRUNCATE denials; 15 function ownership/search paths and RPC allowlist; schema-only no-evidence/no-quota denial; late-DDL atomic rollback; injected seed failures after source/observation inserts and at final validation; missing/drifted scope/functions/privileges/triggers; repeat and partial-seed refusal; exact evidence hash parity; persistent review direct-insert denial; concurrency/5-per-user and 20-per-mission quota infrastructure; non-refunded minute quotas; repeat disable and retained data.

## Separate approval requests

**A — Schema only:** authorize one atomic application of schema SHA `2024f9023006ba4b8134919f1efb7c8f7c550a19668681d5a6a673b53dc6affc` through the managed migration tool, followed by read-only schema/ACL checks and reporting its returned migration-history path. No seed or activation is included.

**B — Synthetic seed only, after A succeeds:** authorize one exact seed SHA `39f18901515d5adbf8942bd88b20723b8ded215d53f07f2d076f3cbcb51c6343` through the privileged data-query tool, contingent on exact schema dependencies and tool acceptance of the single atomic DO statement. No AI, persistent reviews, real data, deployment or unrelated writes. Stop on rejection or drift.

Rollback approval is deliberately separate from A/B and must be explicitly requested only if needed; preparation is not authorization to execute it.

## Changed files

Three pending SQL artifacts above; `scripts/verify-medical-v3-production-synthetic.mjs` (split/failure/denial verification); `scripts/verify-fv01-pg-integration.mjs` (exclude standalone split alternatives from generic harness); this report; `AGENTS.md` (approval/transport boundary); `roadmap.md` (task tracking). No app routes, source catalogs, sealed artifacts or release evidence changed.

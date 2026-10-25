# Medical v3 schema / synthetic seed separation

## Decision

Final seed dependency reconciliation is persisted and disposable-validated; **NO-GO for separately authorizing production seed execution while transport acceptance remains unverified**. The schema was already committed once in the preceding authorized operation; this preparation does not rerun or change it. No production writes, seed, AI, durable approval, real-data processing, scientific activation or deployment occurred in this preparation. P3663, P3664 and P20 official-rules release gates remain BLOCKED. Independent staging is not requested.

## Exact approval artifacts

| Artifact                                                                    | SHA-256                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `supabase/pending/20261027000000_medical_v3_synthetic_schema.sql`           | `2024f9023006ba4b8134919f1efb7c8f7c550a19668681d5a6a673b53dc6affc` |
| `supabase/pending/20261027000000_medical_v3_synthetic_seed.sql`             | `131502bd285c5714586220f05f2f2a0da43c383a88b92dd5372ef0ea811095e1` |
| `supabase/pending/20261027000000_medical_v3_synthetic_disable.rollback.sql` | `e7eb66b4e676aac6b410ca18aaa3ac2758e4ec8bbc7ef809f681415b96cf09b3` |

### Immutable schema facts and exact reconciliation

- Originally approved schema SHA-256: `2024f9023006ba4b8134919f1efb7c8f7c550a19668681d5a6a673b53dc6affc` (pending schema artifact, unchanged).
- Actually committed schema SHA-256: `eb0921ca3155d4e15c9cfb2d60996de85ef53a04956634970ea1a4fc75ffe237` (`drizzle/migrations/0011_medical_v3_synthetic_schema_only.sql`, unchanged; historical journal ID 12).
- Complete byte reconstruction proves only one extra leading space on each of original lines 10 and 350. Tests retain both facts separately rather than normalizing history.
- Seed and retaining-disable each replace only the snapshot dependency hash `cf2b070aa6f7e899efebbc976c2ba08bd1d56e6d277d416b02f0e3d8d82e5795` with `acd4eb5c7bf3bb6495f3ebd78cdb1bf576c16ba71184bc226461f92c33e79259`. Reversing that one replacement reproduces original seed SHA `39f18901515d5adbf8942bd88b20723b8ded215d53f07f2d076f3cbcb51c6343` and disable SHA `40f19bba27c5ba8b42535416ab1eefa22d40b34e29b952f6b91ce6580cab1a21`. No alternate hash, normalization, dependency bypass or other artifact byte change is permitted.

Original bundle: `3370a34b95e5f8385d587481af4763c8e6541d80c8a0ee81b393cc62409b48cc`; original rollback: `1f33ee387540ea8087d44cb3b86400316d6f5578d100505b6aa1cafeaabb97e7`.

Schema excludes outer transaction wrappers and all executed fixture inserts, retaining five tables, 15 final hardened functions, RLS, inherited privilege revocation, four authenticated RPCs, advisory quota locks, and unconditional persistent-review denial. Inserts inside function definitions remain definition-only, not seed operations. Until seeding, authority and quota requests fail closed.

Seed is one data-only privileged PostgreSQL DO statement, not a new function, application endpoint or service-role grant. It serializes with schema/disable, holds scope and data locks, requires the exact mission/crew/membership and empty tables, pins all 15 function definitions/owners/search paths/permissions, verifies RLS and persistence denial, then inserts exactly one source, two observations and two explicitly non-human test receipts. Final checks are inside the same statement. No updates, deletion, role creation or silent repair. Repeat seeding is refused, preserving existing bytes.

Exact observation literals remain `synthetic-v3-hr-001` / 62 bpm / `2026-10-01T10:00:00Z` and `synthetic-v3-hr-002` / 66 bpm / `2026-10-02T10:00:00Z`, metric `cv-001`, domain cardiovascular; receipts retain `2026-10-24T21:06:00Z`. Evidence canonicalization/catalog/source hashes are unchanged.

## Tool compatibility: explicit limitation

The managed migration tool documents atomic transaction and rollback on failure, but the existing schema must not be rerun. The managed data-query tool describes inserts/updates/deletes; its documentation does **not establish acceptance of procedural DO with locks**, a trusted `postgres`/`supabase_admin` execution identity, or a non-executing acceptance/dry-run facility. A fresh documentation lookup and tool-schema inspection did not resolve these gaps. PostgreSQL statement atomicity is executable and tested; acceptance by this exact hosted tool is **UNVERIFIED**. No production call, even a rollback-wrapped probe, was made. Stop before execution; do not split inserts, relax permissions or add a seed RPC. Establish acceptance and execution identity through non-production tool validation/documentation first; a different transport/artifact requires another owner-approved scope/fingerprint.

## Recovery and separately authorized disable

1. **Schema failure:** managed tool rolls back schema and migration journal; verify absence of all five tables/15 functions before an authorized retry. Never combine this alternative with older pending bundles.
2. **Schema committed, seed not run or transport rejected:** schema persists, fixtures remain empty, authority/quota fail closed. No AI activation. After read-only checks, retry only the separately approved identical seed if transport compatibility is established. Do not rerun schema.
3. **Seed statement failure:** PostgreSQL rolls back all seed inserts and releases transaction locks; schema remains. Inspect empty counts and prerequisites; retry only with approval, no repair writes.
4. **Uncertain response/lost receipt:** read back exact counts, IDs, values, timestamps, catalog/source/evidence integrity and ACLs. Exact completed seed means no rerun. Unexpected/partial/conflicting rows mean STOP and retain evidence; no deletions or invented recovery.
5. **Disable after schema-only or seeded completion:** obtain separate explicit authorization for the rollback hash above; keep synthetic server capability off, wait at least 35 seconds and confirm no active lease. Apply disable through atomic schema tool. It verifies expected definitions (including the exact disabled resolver for repeatability), revokes snapshot/evidence/new quota access, replaces authority with an empty resolver, retains every fixture/quota/history row and leaves only caller-owned release available. It is repeatable, non-destructive and does not refund quotas. No schema drop.
6. **Re-enable after disable:** intentionally not supplied or authorized. Seed cannot reactivate disabled authority; fresh review, a fingerprinted recovery change and owner approval are required.

## Executed validation

### Final preparation results (2026-10-25 UTC)

- **568 tests passed**, including three exact-byte reconciliation tests; zero failures.
- **484 disposable production-equivalent SQL assertions**, **30 governance assertions**, **51 synthetic completion assertions** passed (565 SQL assertions total). The persisted verifier now reconstructs the exact already-committed migration and tests the repository artifacts, not temporary substitutes. Production objects/history were not touched.
- Five tables, 15 exact function definitions, hostile inherited ACLs, RLS, application-role CRUD/TRUNCATE denial, four-RPC allowlist, persistence denial, exact synthetic IDs/values/timestamps, canonical evidence hashes, scope revocation, user/mission quotas and repeat retaining-disable compatibility passed.
- Injected failures after source/observation insertion and at final validation roll back the entire seed. Missing/drifted dependencies, wrong scope, repeat/partial seed, original snapshot hash and unrelated formatting drift fail closed. Original and committed snapshot functions return identical complete evidence JSON and digest in executable disposable comparison.
- Security audit passed; lint zero errors / 13 existing warnings. Fresh full-scope Trivy: zero vulnerabilities and zero secrets, including development/unfixed dependencies. Static scientific/security verifiers: **99/102 passed**; only P3663, P3664 and P20 rules remain BLOCKED, unchanged.
- Provider integration used a simulated response with genuine disposable SQL quotas; no live AI or browser acceptance is claimed. No independent staging is requested.
- Exact-final-commit Quality, Security Scan, Medical v3 Release Gate, typecheck and production build require matching public GitHub runs. No manual build/typecheck or inherited older-SHA success counts as final validation; report actual matching status after managed save/synchronization.

### Historical pre-migration validation (not repeated live assertions)

- Live **read-only** compatibility: PostgreSQL 17.6; exact scope prerequisites ready; zero demo tables/functions before work. No production write.
- Disposable PostgreSQL 17.9: **477 split/security/recovery assertions**; **30 governance**, **51 synthetic completion**, **305 FV01 authorization/concurrency** assertions: all pass (863 total). No live AI; server provider response simulated.
- **565 tests pass**, zero fail; security audit pass; lint zero errors / 13 existing warnings.
- Scientific/security static checks: **99/102 pass**; only genuine P3663, P3664 and P20 rules gates blocked and unchanged.
- Fresh full-scope Trivy, including development/unfixed dependencies: **0 vulnerabilities, 0 secrets**.
- Touched-file formatting pass. Automatic preview build OK; no manual typecheck/build or exact-new-commit CI claim.

Coverage includes hostile inherited PUBLIC/anon/authenticated/service-role defaults; all five table CRUD/TRUNCATE denials; 15 function ownership/search paths and RPC allowlist; schema-only no-evidence/no-quota denial; late-DDL atomic rollback; injected seed failures after source/observation inserts and at final validation; missing/drifted scope/functions/privileges/triggers; repeat and partial-seed refusal; exact evidence hash parity; persistent review direct-insert denial; concurrency/5-per-user and 20-per-mission quota infrastructure; non-refunded minute quotas; repeat disable and retained data.

## Separate approval requests

**A — Schema:** already committed once. Do not rerun, roll back or rewrite migration history.

**B — Synthetic seed:** NO-GO for execution authorization until exact single-statement transport acceptance and trusted execution identity are established without a production probe, and exact-final-commit CI is verified. Only then request separate owner approval for seed SHA `131502bd285c5714586220f05f2f2a0da43c383a88b92dd5372ef0ea811095e1`, with all dependency and empty-state checks intact. No AI, persistent reviews, real data, deployment or unrelated writes. Retaining-disable SHA `e7eb66b4e676aac6b410ca18aaa3ac2758e4ec8bbc7ef809f681415b96cf09b3` still needs its own separate authorization if required.

Rollback approval is deliberately separate from A/B and must be explicitly requested only if needed; preparation is not authorization to execute it.

## Changed files

Final preparation changed only the pending seed and retaining-disable SQL artifacts, `scripts/verify-medical-v3-production-synthetic.mjs`, new `tests/domain/synthetic-seed-reconciliation.test.ts`, this existing report, `AGENTS.md` and `roadmap.md`. Approved schema, committed schema/history, app routes, source catalogs, sealed artifacts and release evidence remain unchanged.

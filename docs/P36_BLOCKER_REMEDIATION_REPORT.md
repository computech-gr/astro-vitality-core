# P36 final blocker remediation report

Date: 2026-11-07 UTC. Base: current project checkout after `f3bdf79` (no newer full repository ZIP was
attached; the latest mounted archives are specifications/patches). No production change, live migration,
publication, deployment, flag change, local-record upload or scientific decision was made.

## Defects fixed

| #   | Defect (from NO-GO audit)                                                         | Root cause                                                                        | Fix                                                                                                                                                                    | Evidence                                                    |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | Mission-level Ground Medical/Researcher got an empty crew selector                | `p36-dynamic-review-workspace.tsx` built choices only from crew-bound memberships | New pure `p36-crew-choices.ts` + caller-scoped `mission-crew-roster.ts` (existing RLS read, no elevated key); crew-bound members still see only their own crew        | `tests/domain/p36-crew-choices.test.ts` (6)                 |
| 2   | Stale identity/roles across account changes                                       | Memberships loaded once on mount; hook never re-read identity                     | Workspace memberships bound to `userId` with late-response discard; roster per mission; `useP36Authorization` subscribes to identity changes and resets the mission on account change | typecheck, browser render                             |
| 3   | Researcher saw local registrations via the summary                                | Summary rendered unconditionally and read every crew-bound scope                  | Summary shown only to accounts holding Crew Self/Ground Medical; it reads only submitter scopes                                                                        | `canHoldLocalRequests` test                                 |
| 4   | Summary was local-only and went stale after submission                            | No cloud inventory; reload keyed on user only                                     | Reads the authorized cloud inventory for scopes with requests plus the selected scope; refreshes on submission, focus and scope change                                 | summary tests                                               |
| 5   | Missing SYNCHRONIZED/FAILED; batches not expandable; "additional" counted local   | Status model had 3 states; no term inventory                                      | 5 states checked against the authorized cloud read (submission ID + digest); expandable original/additional batches and per-request term lists; separate "additional submitted" count; "of 12" derived from bundled rows | 6 new summary tests                         |
| 6   | Duplicate detection ignored scope                                                 | Compared bare request IDs                                                         | Occurrences keyed by (scope, request ID); cloud-origin requests included                                                                                               | scope-qualified duplicate test                              |
| 7   | Mission dropdown hidden for a single mission                                      | `missions.length > 1` guard                                                       | Dropdown always shown when at least one mission exists, plus technical ID disclosure                                                                                   | —                                                           |
| 8   | Duplicate registry entries still offered the rest of the registry                 | Per-entry rejection                                                               | Any duplicate fails the whole verified-revisions registry closed                                                                                                       | updated revisions test                                      |
| 9   | App flags did not disable direct RPC writes                                       | No database-level admission                                                       | `p36_dynamic_admission` singleton, **closed by default**, checked by both append RPCs (new `admission_closed` error); app roles cannot change it; retaining disable keeps records readable | SQL harness                     |
| 10  | Approval DOI not bound to the source receipt                                      | APPROVE checked only DOI/PMID shape                                               | Approval must cite the receipt's own `validation_reference`                                                                                                            | SQL harness negative                                        |
| 11  | Revocation race unproven                                                          | Membership/assignment read without locks                                          | `FOR SHARE` locks in both append RPCs; a concurrent committed revocation is honored                                                                                    | SQL harness lock-timeout + race tests                       |
| 12  | Out-of-order rollback possible                                                    | No ordering guard                                                                 | Handoff rollback refuses while authorization objects exist; drops admission table                                                                                     | empty forward/rollback rehearsal                            |
| 13  | `verify-unified-intake.mjs` FAIL                                                  | Verifier still expected the base classifier name after the governed wrapper was introduced | Accepts the governed wrapper only if it delegates to `classifyIntakeObservation`                                                                                     | verifier PASS                                               |
| 14  | Formatting FAIL                                                                   | Unformatted `docs/P36_DYNAMIC_RECONCILIATION_PHASE1_AUDIT.md`                     | Prettier applied (whitespace only)                                                                                                                                     | `format:check` PASS                                         |
| 15  | Dependency audit 5 findings                                                       | Outdated transitive versions                                                      | `bun audit fix` within declared ranges: `@hono/node-server` 2.1.3, `qs` 6.16.1, esbuild in `@lovable.dev/mcp-js` 0.27.2                                                | 3 fixed, 2 remain (below)                                   |
| 16  | Conflicting migration instructions                                                | Final UX checklist required the unrelated fixed-dossier file and the wrong socket | One sequence in `docs/P36_AUTHORITATIVE_MIGRATION_SEQUENCE.md`; old checklist marked superseded                                                                         | —                                                           |

## Tests

| Gate                                | Result                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full Bun suite                      | **PASS** — 1,195 tests, 0 failures, 12,541 expectations, 190 files                                                                                                      |
| Typecheck (`tsc --noEmit`)          | **PASS**                                                                                                                                                                |
| Lint                                | **PASS** — 0 errors, 12 existing warnings                                                                                                                               |
| Formatting                          | **PASS**                                                                                                                                                                |
| Security boundary audit             | **PASS**                                                                                                                                                                |
| Production build                    | **PASS**                                                                                                                                                                |
| Disposable dynamic SQL (socket-only PostgreSQL 17.11, no TCP) | **PASS** — 33 checks (was 22)                                                                                                              |
| Empty forward + ordered rollback    | **PASS**; out-of-order rollback refused                                                                                                                                 |
| Offline verifiers                   | 107 PASS. Not passing: P3663, P3664, P20 (owner evidence); staging-target BLOCKED; 4 medical-v3 checks need their own disposable socket (service-dependent, unchanged) |
| Dependency audit                    | 2 moderate remain: esbuild ≤0.24.2 under `drizzle-kit` (dev tool) and minimatch under eslint/typescript-eslint (dev tooling); fixes cross major versions                |
| Browser (desktop 1280 / mobile 390) | Scientific Review renders with no errors or overflow, signed out and signed in. The owner account has no Ground Medical/Researcher membership, so the summary and selectors correctly stay hidden |
| Fixed-dossier SQL harness           | Not re-run (file unchanged)                                                                                                                                             |
| Two-account authenticated browser   | **BLOCKED** — no isolated non-production auth/data services                                                                                                            |

The 12-term and 197-term SQL flows use synthetic metadata only. The user's encrypted local request was
never read, uploaded or changed.

## Exact migration order

See `docs/P36_AUTHORITATIVE_MIGRATION_SEQUENCE.md`: handoff `c36ed38b…ff83d`, then authorization
`47c3498f…3b06`; rollback in reverse (`4af6a908…5704`, then `985188b2…bdd4a`). Admission stays closed
until it is separately opened.

## Remaining blockers

1. Real two-account browser acceptance requires an isolated non-production app plus auth/data stack, with Ground Medical and Researcher test accounts.
2. Exact-commit GitHub CI (Quality, Security/Trivy) on the synchronized revision.
3. Effective production ownership, inherited ACLs and migration history attestation (read-only, owner-authorized).
4. Owner evidence gates P3663/P3664/P20 (unrelated to P36, unchanged).
5. Two dev-tool dependency advisories that need major-version updates.
6. Independently provisioned source receipts and genuine Researcher decisions. These are scientific actions, never fabricated.

## Readiness

**Ready for controlled staging acceptance: YES**, conditional on blockers 1–3 being provided in an isolated
environment. **Not production-ready.** Every production step remains separately owner-authorized.

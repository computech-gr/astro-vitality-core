# P52.1 — Offline module import errors in GitHub CI

## Reported failure (commit 02778ec)

Quality #336 and Medical v3 Release Gate #76 (Bun 1.4.4): 854 tests across 161 files, 852 pass, 2 errors:

- `SyntaxError: Export named 'synchronizeOfflineMissionQueue' not found in src/infrastructure/offline/index.ts`
- `SyntaxError: Export named 'InMemoryOfflineMissionStore' not found in src/infrastructure/offline/index.ts`

## Root cause

The offline module is correct: `src/infrastructure/offline/index.ts` re-exports `store.ts` (`InMemoryOfflineMissionStore`) and `runtime.ts` (`synchronizeOfflineMissionQueue`). No source change was needed.

Two test files replaced the whole module with a two-export stand-in:

- `tests/domain/p28-unified-health-report.test.ts`
- `tests/mission/p26-health-measurement-profiles.test.ts`

Bun module mocks are process-wide and persist into later test files. When GitHub's file order ran one of these files before the real module was loaded, later importers (`tests/offline/p14-offline-mission.test.ts`, and `src/infrastructure/ground-research/runtime.ts` via other tests) saw only the stand-in's two exports.

Reproduction: a clean `git archive` checkout of 02778ec with Bun 1.4.4 produced the exact `InMemoryOfflineMissionStore` error once (`p28` then `p14`). The mechanism reproduces deterministically in a minimal two-file Bun 1.4.4 project with the same `@/` path alias; whether it appears in the full project depends on file and load order.

## Fix (tests only)

- Both stand-ins now spread the real module (`...actualOffline`) and override only the two storage functions they replace; each restores the real module in `afterAll`.
- New `tests/offline/p52-1-offline-module-contract.test.ts`: asserts the barrel exposes both names, and fails if any test replaces the offline module without keeping and restoring the real exports (confirmed failing against the 02778ec version of p28).

Offline encryption, queue synchronization, mission isolation, authorization and fail-closed behavior are untouched. No tests disabled; no security or scientific assertions changed.

## Local results (clean checkout, Bun 1.4.4)

| Check                                                     | Before (02778ec)                                      | After                             |
| --------------------------------------------------------- | ----------------------------------------------------- | --------------------------------- |
| Tests                                                     | 862 pass / 161 files (local order did not trigger it) | 864 pass / 162 files, 0 errors    |
| `bun run check`                                           | —                                                     | PASS                              |
| typecheck, lint (0 errors), format, security audit, build | —                                                     | PASS                              |
| Medical v3 release gate structure                         | —                                                     | PASS                              |
| P47 competition handoff, P35 submission readiness         | —                                                     | PASS                              |
| Static gates P3663, P3664, P20 submission                 | blocked                                               | blocked (owner/external evidence) |

GitHub Actions results for the new commit are not attested here.

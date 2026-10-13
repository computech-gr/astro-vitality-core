# FV-01.4.2 — B1–B7 Final Evidence Report

Date: 2026-10-13 (UTC). Owner: Theodore Silvestros.

## Evidence matrix

| Step | Scope | Status | Evidence |
| --- | --- | --- | --- |
| B1 | Create FV01-TEST-A / FV01-TEST-B (PLANNING) | PASS | Owner screenshots + read-only DB verification |
| B2 | One synthetic ACTIVE crew per test mission, Crew B rename | PASS | Read-only DB + single update audit entry |
| B3 | Two single-use Crew Self invitations | PASS | Read-only DB: mission/crew-bound, active, 24 h expiry |
| B4 | Invitation acceptance in separate sessions | PASS | Read-only DB: one Crew Self membership per account, invites claimed once |
| B5-A | Screen-level isolation | PARTIAL | Required screenshots not all supplied |
| B5-B | Count-only RLS (missions, memberships, crew, events, audit) | PASS | Owner-run: 10/10 expected counts; events then inconclusive (0 rows) |
| B6-A | Synthetic event test page (submission disabled) | PASS | Published, hard-disabled, no events |
| B6-B | One synthetic event per test account | PASS | Owner: both ACCEPTED; DB: exactly 2 events + 2 index rows |
| B7 | Cross-mission event RLS isolation | PASS | Owner-run count-only Gate 2 (below) |
| — | Duplicate production submission test | NOT EXECUTED | — |
| — | Cross-mission write attempts | NOT EXECUTED | — |

## B6-B database verification (read-only)

- `fv01-b6-a-001` → FV01-TEST-A / FV01-CREW-A; `fv01-b6-b-001` → FV01-TEST-B / FV01-CREW-B.
- Both `operational_event`, `synthetic`, source `fv01-b6-synthetic` 1.0.0, payload `{fv01Test:"B6", synthetic:true}`.
- Two matching index rows, no metric code (no medical measurements).
- MISSION_TEST unchanged; test missions PLANNING; memberships 7, invitations 5, crew 3.
- Non-read audit entries 17 → 19 (two `mission_event_ingested` only).

## B7 Gate 2 (owner-run, normal authenticated sessions)

| Account | FV01-TEST-A | FV01-TEST-B | MISSION_TEST | Result |
| --- | --- | --- | --- | --- |
| TEST A (Crew Self, FV01-TEST-A) | 1 | 0 | 0 | PASS |
| TEST B (Crew Self, FV01-TEST-B) | 0 | 1 | 0 | PASS |

## Cleanup

Removed all temporary diagnostics (`/diag/fv0142h-synthetic-event`, `/diag/fv0142i-event-isolation`, their components, logic and tests). The two synthetic events, index rows and all audit records are permanent and preserved. No missions, memberships, invitations, RLS, grants or platform roles changed.

## Remaining blockers

- B5-A screen-level evidence PARTIAL.
- Duplicate and cross-mission write tests NOT EXECUTED.
- FV-01-13 (sandbox_exec privileged role) OPEN pending Lovable Support remediation.
- Final Security Gate BLOCKED.

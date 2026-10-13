# FV-01.4.1F — Phase A final execution gate

Status: A3, A7, and direct per-user backend authorization remain NOT VERIFIED. This checklist supplements the existing Phase A protocols and evidence register; it does not supersede them.

## A3 — Concurrent session separation (owner-executed)

1. Use two distinct persistent browser profiles (not two private windows sharing storage).
2. In Profile A, sign in to `https://mitochondria.edocinfo.com/mission/identity` as `security@computech.gr`; in Profile B sign in as `support@computech.gr`.
3. Keep both windows open at the same time. Refresh A, then B.
4. Verify A still shows `security@computech.gr`, B still shows `support@computech.gr`, and both show zero active memberships.
5. Record the date/time and owner observation. A screenshot of each window is useful, but separate screenshots alone do not prove simultaneity; include a single desktop screenshot showing both windows when practical.

Expected: no identity crossover, no unexpected memberships. If either profile displays the other account or real mission information, stop and report; do not continue.

## A7 — Independent sign-out (owner-executed)

1. With A and B simultaneously signed in, sign out A.
2. Refresh B; verify B remains authenticated as `support@computech.gr` with zero memberships.
3. Verify A is signed out; then sign out B and verify B is signed out.
4. Record the observed outcome. Do not include cookies, tokens, passwords, or browser storage in screenshots.

## RLS — Separate, direct authorization gate

A3 and A7 do not establish backend RLS. Before attempting this gate, identify an existing documented **read-only** client operation that is expected to return an empty/denied result for a user with no mission membership. A project maintainer must inspect the actual operation and confirm that it is non-mutating, contains no privileged credentials, does not reveal real mission or astronaut health data, and runs under the normal signed-in user's session.

For each test account, execute only that approved operation using the application's existing client path. Capture a sanitized result (e.g. an empty membership-scoped result, or an authorization error) and distinguish the observed result from a server-side authorization assertion. Do not fabricate endpoints, call privileged admin tools, copy session tokens, or probe production mission identifiers. If no safe operation is documented, mark RLS NOT VERIFIED and request a reviewed, non-mutating test plan; do not substitute a privileged database query or UI screenshot.

## Evidence recording

| Case                     | TEST A  | TEST B  | Evidence                                             | Status       |
| ------------------------ | ------- | ------- | ---------------------------------------------------- | ------------ |
| A3 concurrent identities | Pending | Pending | Owner observation + optional dual-window screenshot  | NOT VERIFIED |
| A7 independent sign-out  | Pending | Pending | Owner observation                                    | NOT VERIFIED |
| Direct per-user RLS      | Pending | Pending | Reviewed safe read-only operation + sanitized result | NOT VERIFIED |

Never automatically change NOT VERIFIED to PASS just because this document is added or checks are green. The owner must provide observations for A3/A7; an approved direct authorization test is needed for RLS.

## Unchanged security gates

Phase B: NOT APPROVED. Do not create synthetic missions, invites, roles, or permanent audit entries. FV-01-13 (`sandbox_exec`): OPEN. Final FV-01 security approval: BLOCKED.

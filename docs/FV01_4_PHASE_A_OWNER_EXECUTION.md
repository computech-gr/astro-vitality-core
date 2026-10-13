# FV-01.4.1C — Owner-executed browser evidence

Status: NOT VERIFIED until owner records observations from two separate browser profiles. This is an execution aid to `FV01_4_PHASE_A_BROWSER_ACCEPTANCE.md`, not a replacement.

## Scope and safeguards

- Production URL: `https://mitochondria.edocinfo.com/mission/identity`.
- Profile A: TEST A (`security@computech.gr`); Profile B: TEST B (`support@computech.gr`).
- Use two separate regular browser profiles, not two private windows sharing a session.
- No changes to production data; no bootstrap, invites, roles, mission creation, privileged impersonation, or manual API probing.
- Do not record passwords, tokens, cookies, authorization headers, invitation codes, or health data.
- If real mission information or unauthorized controls appear, STOP and report with sanitized screenshot.

## Exact execution order

1. Open Profile A, sign in as TEST A, verify the identity email and `Active memberships: 0`.
2. Open Profile B independently, sign in as TEST B, verify its own identity email and `Active memberships: 0`.
3. Keep both sessions open; refresh both pages and confirm the identities remain separate.
4. In each profile, visit Mission & Crew Operations through the app navigation; verify operator membership is required and create/invite actions are unavailable.
5. In each profile, verify that first-operator activation is not shown.
6. Sign out Profile A; verify Profile B remains authenticated. Then sign out Profile B.
7. Capture only redacted screenshots and record the observations below.

## Owner evidence record

| Case | Expected                                         | Observed | Evidence filename | Status       |
| ---- | ------------------------------------------------ | -------- | ----------------- | ------------ |
| A1   | TEST A email; 0 active memberships               | Pending  | Pending           | NOT VERIFIED |
| A2   | TEST B email; 0 active memberships               | Pending  | Pending           | NOT VERIFIED |
| A3   | Simultaneous profiles retain separate identities | Pending  | Pending           | NOT VERIFIED |
| A4   | TEST A cannot access operator controls           | Pending  | Pending           | NOT VERIFIED |
| A5   | TEST B cannot access operator controls           | Pending  | Pending           | NOT VERIFIED |
| A6   | Bootstrap form hidden in both profiles           | Pending  | Pending           | NOT VERIFIED |
| A7   | Independent sign-out                             | Pending  | Pending           | NOT VERIFIED |

## Separate authorization gate

Actual per-user backend RLS denial remains NOT VERIFIED unless tested with a pre-existing documented safe read-only operation under each ordinary user session. UI-only checks and privileged database lookups cannot establish this gate. Do not invent endpoints or request production health data.

## Phase B and security gate

Phase B: NOT APPROVED. No persistent synthetic missions without explicit owner approval and acknowledgement of append-only audit traces. FV-01-13 (`sandbox_exec`): OPEN. Final FV-01 security approval: BLOCKED.

# FV-01.4 — Controlled live authorization acceptance

Status: PRE-FLIGHT / NOT APPROVED. This document does not assert security acceptance.

## Existing identities (owner-reported)
- TEST A: security@computech.gr — signed in, UI displayed 0 active memberships.
- TEST B: support@computech.gr — account created; confirmed sign-in and 0 memberships are NOT VERIFIED.
- Existing real mission and its memberships must remain untouched.

## Hard stop conditions
- Never run first-operator bootstrap in an already activated deployment.
- Never use a service-role key, admin impersonation, or a privileged database session to simulate a browser user.
- Do not paste passwords, invitation tokens, session tokens, or real health data into reports.
- Do not create a test mission until the owner expressly approves persistent production fixtures.
- If either unassigned test account sees any real mission data, STOP, record sanitized evidence, and investigate.
- Keep FV-01-13 (sandbox_exec) OPEN and FV-01 security approval BLOCKED pending support resolution.

## Phase A — Zero-membership acceptance (no writes)
1. TEST A: independently sign in and out through Mission Identity; verify displayed email and 0 active memberships.
2. TEST B: independently confirm email, sign in and out; verify displayed email and 0 active memberships.
3. Test simultaneously using separate browser profiles; each session must show its own identity only.
4. With each test account, visit Mission & Crew Operations; expect 'Operator membership required' and no create/invite controls.
5. Verify the bootstrap activation form is absent on the already-activated production backend; no attempt to arm or redeem bootstrap.
6. Record screenshots with secrets and unrelated identifiers redacted. UI observations are not a substitute for direct RLS tests.

## Phase B — Production fixture approval gate
Before any write, explicitly approve the creation of TWO persistent, clearly labeled synthetic missions, and record the operator identity that will create them. Confirm audit/event records may be append-only and not deletable. Do not reuse or edit the real mission. Use only synthetic crew and data. Create missions via the normal authorized Mission & Crew Operations UI and verify exact mission IDs before issuing invites. Keep a manifest of synthetic fixture IDs, creator, timestamp, expected roles, and expected data retention.

## Phase C — Mission and role isolation
After approval and creation, test authorized invite issuance/acceptance using separate real browser sessions for TEST A and TEST B. Validate expected same-mission access and deny cross-mission reads and writes using the normal user context, not elevated credentials. Record HTTP status/error class and redacted audit evidence; never expose private records. Test operator, ground_medical and crew_self scopes only when provisioned by the documented authorized workflow.

## Acceptance and reporting
For each case record PASS / FAIL / NOT VERIFIED, actor, mission code, expected behavior, observed behavior, evidence pointer, and whether production was mutated. A UI-only pass cannot be reported as a database authorization pass. No final FV-01 approval while FV-01-13 remains open.

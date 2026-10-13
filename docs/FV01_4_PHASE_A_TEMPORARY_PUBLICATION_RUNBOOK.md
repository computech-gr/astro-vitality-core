# FV-01.4.1I — Temporary Production RLS Probe Publication & Evidence Runbook

Status: **AWAITING EXPLICIT OWNER PUBLICATION APPROVAL**. Phase B: **NOT APPROVED**. FV-01-13: **OPEN**. Final FV-01 security approval: **BLOCKED**.

## Scope

This is a documentation-only release gate. The FV-01.4.1H read-only probe already exists in the application; do not reimplement it. No database migration, role change, invite, mission creation, or new diagnostic code is authorized by this document.

## Before publication

1. Confirm the exact current build contains the FV-01.4.1H guardrails and all 208 tests pass, plus security audit, typecheck, lint, format and build.
2. Confirm the canonical published origin is `https://mitochondria.edocinfo.com` (not a Lovable Draft/Preview).
3. Record the commit/build identifier and current publication state for rollback.
4. Explain that the two test email addresses are visible in public client code and that a failed count may disclose aggregate counts. Do not include screenshots of nonzero counts in public artifacts.
5. Obtain the owner's explicit approval **for temporary publication only**. Uploading this document is not approval.

## Owner-run test — only after approved publication

- Open the canonical published app in two **independent browser profiles**: TEST A (`security@computech.gr`) and TEST B (`support@computech.gr`). Never share passwords, cookies, session tokens or authorization headers.
- Verify each profile shows its own email and zero active memberships. Refresh both profiles while both remain signed in; record A3 as PASS only if identities remain separate.
- On each signed-in account's Mission Identity page, click the temporary probe **once**. Do not run it from Draft/Preview.
- For each account, record the five counts/statuses, without identifiers or raw backend errors:
  - R1 `missions`: expected 0
  - R2 `mission_memberships`: expected 0
  - R3 `crew_members`: expected 0
  - R4 `mission_events`: expected 0, but non-probative while the table is empty
  - R5 `audit_events`: expected 0
- Mark PASS only for completed, successful count=0 reads. Errors, missing counts and unavailable reads are NOT VERIFIED, not PASS.
- **STOP immediately** if any count is above zero. Do not share a screenshot publicly; report privately that the check failed and investigate authorization. Do not repeat the probe until resolved.
- Sign out TEST A; refresh TEST B and confirm it stays authenticated. Then sign out TEST B. Record A7 only after this observation.

## After testing

1. Preserve a private, sanitized evidence record of actual observations and which browser profile produced them.
2. Remove the temporary diagnostic component, its wiring and any probe-only tests with a separate reviewed removal patch.
3. Re-run the full checks and publish the cleaned build. Confirm the diagnostic is absent from the public site.
4. Keep Phase B NOT APPROVED until explicitly authorized. Keep FV-01-13 OPEN and final security approval BLOCKED until separately resolved.

## Evidence template

| Check                              | TEST A       | TEST B       | Evidence / limitations           |
| ---------------------------------- | ------------ | ------------ | -------------------------------- |
| A3 independent concurrent sessions | NOT VERIFIED | NOT VERIFIED | Owner browser profiles required  |
| R1 missions                        | NOT VERIFIED | NOT VERIFIED | Count-only                       |
| R2 mission_memberships             | NOT VERIFIED | NOT VERIFIED | Count-only                       |
| R3 crew_members                    | NOT VERIFIED | NOT VERIFIED | Count-only                       |
| R4 mission_events                  | NOT VERIFIED | NOT VERIFIED | Empty-table result not probative |
| R5 audit_events                    | NOT VERIFIED | NOT VERIFIED | Count-only                       |
| A7 independent sign-out            | NOT VERIFIED | NOT VERIFIED | Owner browser profiles required  |

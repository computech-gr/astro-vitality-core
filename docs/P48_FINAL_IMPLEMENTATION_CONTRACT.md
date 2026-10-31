# P48 FINAL — Authorized synthetic Crew Self demonstration

This is one consolidated implementation contract for Lovable to implement against the attached current source. Do not silently substitute direct database writes or bypass RLS.

## Non-negotiable scope

- No existing account, mission, membership or health record may be reused or modified.
- Never modify medical_sensitive observations or history. No SQL migrations or RLS changes.
- Implement a **Crew Self only** synthetic observation entry panel behind an explicit feature flag, default OFF, visible only for an authorized, active Crew Self scope in a dedicated `P48_SYNTHETIC_DEMO` mission. Do not allow operator/researcher/admin bypass.
- Existing `ingest_mission_event` RPC is the sole writer. Before implementing, inspect its actual TypeScript signature and SQL contract, required payload fields, allowed metric codes, timestamp restrictions, audit and index behavior. Do not guess parameters. Reject if unknown.
- `classification = synthetic` must be enforced by code (not a user-editable field). Source IDs must clearly identify synthetic source, and payload must clearly label the reading as synthetic. Never imply a real sensor, medical record or clinical baseline.
- Limit metric choices to verified canonical metrics and units that the Companion already supports. Provide 2 synthetic sources and dates spanning >90 days, with validation of finite numbers, valid timestamps, canonical units, duplicate prevention and per-crew scope.
- A human must review each batch and explicitly confirm irreversible append-only writes. No auto-seeding on mount, preview, CI, migration, build, sign-in, or deployment. Require per-account signed-in action. Show exact planned count and target mission/crew, not passwords or invite tokens.
- Disable entry outside the dedicated synthetic mission and after revocation; reject stale async responses and cross-crew results. Keep read-side authorization fail-closed (P48.2).
- No automatic creation of accounts, invites, mission, crew, memberships or records. Only owner-approved operator UI onboarding.
- Avoid storing passwords, invite secrets, health values or private identifiers in reports or logs. Keep submission/demo results limited to counts, access-denied outcomes and test status.

## Isolation decision gate

1. Inspect whether a new Lovable draft can have its own database; creating a draft is NOT authorized by this contract. Report steps for owner to approve and verify isolation.
2. If isolated environment is unavailable, STOP and request explicit authorization for a live shared-backend synthetic mission and permanent writes.
3. Confirm that email signup/confirmation is configured before creating two dedicated test identities controlled by the team.

## Acceptance sequence (only after approvals)

A. Operator creates dedicated mission and Crew A/B, creates invites via existing UI; each of two distinct dedicated accounts accepts its own invite. Never paste invite codes in reports.
B. Each Crew Self enters six explicitly synthetic observations through approved UI, using two sources and date coverage >90 days. Review batch before submit. Confirm database counts and classification read-only.
C. Crew A sees own chart/table; all/7/30/90 and source filters correctly narrow only their own readings. Crew B's readings remain invisible to Crew A including direct API read. Operator and signed-out users see none.
D. Revoke Crew A through operator UI; subsequent reads return zero; returning to tab clears private evidence. Verify stale-response and offline failures fail closed.
E. Close mission through operator UI only after owner confirms. Capture counts/results, not medical values, credentials or invite secrets.

## Additional fixes consolidated

- Replace obsolete P48.1 static verifier that expects window.location.reload with a P48.2-aware assertion; do not reinstate reload.
- Fix formatting in only the three previously identified older docs if safe and semantics unchanged.
- Review five dependency advisories (4 moderate, 1 low), record direct/transitive, dev/prod exposure and available non-breaking fixes; no unapproved major upgrades.
- Verify browser notification permission in real Edge/Chrome separately; it is independent of in-page reminders.
- Explicitly document remaining continuously-visible-tab revocation limitation; do not claim instant remote revocation without push or polling.

## Quality gates

Full tests, typecheck, lint, security audit, production build, formatting, RLS isolation harness, browser desktop/mobile. Add real authenticated end-to-end tests when the approved test environment exists. Preserve all P45-P48.2 behavior. No publishing.

## Competition integrity

Preserve real Git/Supabase timestamps and disclose pre-existing code. Do not rewrite history to imply creation during the hackathon.

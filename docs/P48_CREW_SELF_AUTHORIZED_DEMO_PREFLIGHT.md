# P48 — Authorized Synthetic Crew Self: preflight and acceptance contract

## Why this gate is necessary
P47.1 passes 810 tests according to Lovable, but no real signed-in Crew Self membership has been tested. Synthetic UI charts are not proof of end-to-end access isolation. Do not fabricate identities or directly mutate production health data to make a demonstration work.

## Stage A: Read-only discovery (this patch)
1. Run `node scripts/verify-p48-crew-self-readiness.mjs` at repository root.
2. Inspect actual mission/crew identity schema, sign-in flow, membership authorization, server-side evidence loader, RLS, synthetic mission fixtures and available demo environment. Report exact routes and required roles; do not guess.
3. Identify whether an existing approved synthetic Crew Self test account can be provisioned via supported app flows in a non-production environment. Do not change production auth, membership or RLS in this stage.
4. Check that UI reads only the authenticated crew's mission evidence and that a second crew's records remain inaccessible at API/server level, not just filtered in the UI.

## Stage B: Explicitly approved provisioning (separate follow-up)
Only after owner authorization, provision a clearly labeled synthetic crew account through existing approved identity/membership workflows in an isolated test environment. Avoid real medical data, secrets in repository, hard-coded credentials, service-role keys in frontend, RLS bypasses and synthetic data mixed into production clinical records. No self-service privilege escalation.

## Acceptance evidence required
- Authenticated Crew Self sees own observations and 7/30/90-day/source filters.
- Different Crew Self cannot retrieve first member's evidence by changing URL, request parameters or IDs.
- Signed-out and ordinary non-Crew accounts fail closed.
- Synthetic demonstration remains separate and available without accessing private records.
- Revocation invalidates access; error/empty/loading states are accurate.
- All tests, typecheck, lint, security audit, formatting and production build reported; pre-existing warnings separated.
- No publishing without explicit approval.

## Scope
This P48 preflight adds only a read-only static verifier and this contract. It does NOT implement Crew Self provisioning or certify RLS. Further implementation must be based on inspected schema and authorization flow.

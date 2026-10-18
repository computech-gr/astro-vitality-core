# P35.13 Guided Synthetic Demo Navigation

This change keeps all ten demo destinations, adds explicit advisory per-step role evidence, and marks MISSION_TEST as reserved for final acceptance. The status is **not authorization**; each route and backend independently enforces existing RBAC/RLS. No role grant, impersonation, migration, mission creation, write, clinical activation, or real-data ingestion is introduced.

## Remaining approval-gated work

Actual super-administrator capabilities for info@computech.gr require a separate privileged backend identity and grant review, isolated synthetic demo mission, independent reviewer separation, audited authorization and security acceptance. Never derive administrator privileges from mission_operator membership or client-side email checks. Do not alter MISSION_TEST. Scientific drafts remain pending independent review.

## Acceptance

Run focused test `bun test tests/mission/p3513-guided-demo-navigation.test.ts`, then one `bun run check` (includes typecheck and build). Browser-test launchpad as the existing operator and signed-out navigation only; no role switching or data writes.

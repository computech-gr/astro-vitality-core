# P35.14 — Operator demo execution tracker

This release adds a ten-step **manual, volatile** checklist to the existing mission launchpad, retaining the five-menu navigation and all existing destination RBAC/RLS.

- Operator may mark a destination **observed**, **blocked**, or **not checked** after navigating to it. These marks are not authorization evidence and do not imply the action completed.
- Marks are kept only in component state, reset on reload or mission selection, and are not persisted or sent to Cloud.
- `MISSION_TEST` and blank mission codes cannot be marked.
- No migrations, role grants, synthetic records, impersonation, real measurements, or clinical activation.
- `info@computech.gr` remains Mission Operator, **not** Super Administrator.

## Required next release: actual administrator synthetic demo

Implement a dedicated isolated synthetic mission and server-enforced demo-admin capability. Require verified privileged backend provisioning, strict mission scoping, no bypass of independent Ground Medical decision separation, and no access to other users' private data. Provisioning and migration are separate owner-approved gates. Do not pretend a navigation checklist supplies these capabilities.

## Fast acceptance

Run focused P35.11/P35.13/P35.14 tests and one `bun run check`; browser verify checklist reset, reserved mission disabled, and signed-out launchpad hidden. No publish.

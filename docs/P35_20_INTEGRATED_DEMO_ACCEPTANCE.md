# P35.20 — Integrated offline demo artifact acceptance

## Scope

- Local inspection supports exact synthetic datasets and exact integrated offline bundles for the currently selected mission.
- Rejects modified, malformed, cross-mission, unsupported and extra-field integrated bundles.
- Displays six explicit acceptance gates, distinguishing local functionality from owner-approved backend changes and independent scientific/security acceptance.
- No migration, mission provisioning, RLS change, impersonation, canonical data import, server write or publishing.

## Verification

Run focused `bun test tests/mission/p3520-integrated-acceptance.test.ts` followed by **one** `bun run check`. Browser-check integrated bundle export then local re-inspection, tampered bundle rejection, cross-mission rejection, and signed-out hiding. Do not repeat typecheck/build separately if covered by `check`.

## Deferred / not implemented

Actual isolated demo mission, backend Administrator permission, independent Ground Medical sign-off, canonical PDF/device pipeline, and scientific/security acceptance. These require governed authorization, implementation and acceptance. `MISSION_TEST` stays reserved and unchanged.

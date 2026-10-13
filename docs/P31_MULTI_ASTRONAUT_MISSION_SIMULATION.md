# P31 — Multi-Astronaut Mission Simulation

## Scope

- Four independently seeded deterministic streams, built on the existing P17 canonical synthetic generator.
- Mission Day 120 Mars transit narrative, read-only merged timeline, per-crew filtering and JSON replay export.
- Reuses `/mission/simulation` rather than introducing a duplicate route or navigation entry.
- Each observation retains `synthetic` classification and explicit crew/mission identity; synthetic source IDs and ingestion IDs are crew-prefixed.
- No new migrations, network fetches, storage, authenticated record access, background transfers, clinical scores, or research export.
- Different scenarios are software demonstration fixtures; they are **not** physiological forecasts, clinically validated cohorts, or evidence of causality.

## Acceptance

`node scripts/verify-p31-multi-crew.mjs`
`bun test tests/simulation/p31-multi-crew.test.ts tests/simulation/p17-synthetic-mission.test.ts`
`bun run typecheck`
`bun run build`

## Deferred to P34

Real-device offline and reconnect, auth expiry, multi-tab races, browser UX and mission-level E2E acceptance.

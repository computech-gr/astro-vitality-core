# P48 FINAL — Crew Self synthetic intake: implementation and verification

Date: 2026-10-31. No draft, user, mission, invite, membership or record was created in the
project backend. No migration, RLS change, configuration change or publishing.

## Verified live RPC contract (read-only `pg_get_functiondef`)

`ingest_mission_event(p_event jsonb, p_idempotency_key text)`, security definer:

- Requires `auth.uid()`; idempotency key 16–256 chars.
- `p_event`: `id` (≤160), `kind` (observation…), `classification`
  (synthetic | deidentified | mission_sensitive | medical_sensitive), `sourceId` (≤160),
  `sourceVersion` (≤80), `sourcePriority` 0–100, `eventTimestamp`, `createdAt`,
  `mission.{missionId,crewMemberId}` (≤128), structured `payload` ≤256 KiB.
- Caller must be the active crew_self of that crew, ground_medical, or operator (operators
  limited to non-medical `operational_event`). Access is checked before any existing-row
  lookup, so other crews' identifiers are never confirmed.
- Same id/key + same payload hash → `duplicate`; different payload → `conflict`; other scope
  → `rejected`. New writes need an active crew assignment and an open mission
  (planning/active). No timestamp range restriction (backdating allowed).
- Writes one `mission_events` row (append-only triggers), one `audit_events` row and, via
  trigger, one `crew_health_record_index` row using `payload.observation.metric.code`.

## What was built

- `src/domain/companion/synthetic-intake.ts` (pure): exact RPC payload builder through the
  canonical `ingestCanonicalObservation` pipeline; classification fixed to `synthetic`;
  explicit `syntheticDemonstration` label in every payload; only `phys.heart_rate`
  (bpm, {beats}/min), `phys.hrv_rmssd` (ms) and `sleep.duration` (h, hours); two synthetic
  sources; finite >0 values (sleep ≤24 h); valid, non-future, ≤400-day timestamps; ≤12 per
  batch; deterministic ids/keys so retries are database duplicates; eligibility rule; counts.
- `src/lib/p48-synthetic-intake.functions.ts`: default-off (`P48_SYNTHETIC_INTAKE_ENABLED`
  server flag, unset). Authenticated status and submit functions acting as the signed-in user
  (no service role, no direct table writes). Re-checks: dedicated `P48_SYNTHETIC_DEMO`
  mission, open status, caller's own active crew_self for exactly this crew and no other role
  in the mission; requires `irreversible: true`, typed mission code and matching planned
  count; stops on first refusal; returns counts only.
- `src/components/p48-synthetic-intake-panel.tsx` in the Companion: rendered only for a
  server-confirmed eligible scope; scenario A/B presets (6 readings, 2 sources, >90 days);
  editable review table; checkbox + typed confirmation that reset on any edit; one explicit
  submit; hidden on tab hide, scope change and revocation; reloads evidence after submit.
- `scripts/verify-p48-1-visibility-guard.mjs` now asserts the P48.2 behaviour and that the
  reload is never reinstated.
- Three older docs (P34, P36.3, P36 contract) reformatted by Prettier; text unchanged apart
  from whitespace, table alignment and emphasis markers.

## Verification

- Unit: `tests/domain/p48-final-synthetic-intake.test.ts` (13) + P48.2 tests.
- Disposable PostgreSQL with every production migration and the real RPC
  (`FV01_PG_SOCKET_DIR=… bun scripts/verify-p48-synthetic-pg.ts`): 14/14 PASS — A and B each
  6 accepted; retry duplicate; A cannot write B; operator cannot write observations; A and B
  read only their own 6; operator reads none; all rows synthetic; 12 index rows with canonical
  codes; append-only; after operator deactivation A reads 0 and cannot write; B unaffected.
- Browser (stubbed, 1280px and 390px): builder payloads render for crew A with 3 metrics,
  7/90-day and source filters narrow correctly, crew B values never appear, panel hidden when
  not eligible; panel review/confirmation gate, edit reset, validation message, single submit,
  hide/revocation hiding.

## Dependency advisories (all transitive)

| Package           | Severity     | Path                                       | Exposure      | Non-breaking fix                                       |
| ----------------- | ------------ | ------------------------------------------ | ------------- | ------------------------------------------------------ |
| @hono/node-server | moderate     | @lovable.dev/mcp-js → MCP SDK              | production    | 2.1.3 is inside the SDK's `^2.0.5` range; not applied  |
| qs                | moderate     | @lovable.dev/mcp-js → MCP SDK → express    | production    | 6.16.1 is inside express `^6.14.0`; not applied        |
| esbuild (2)       | moderate/low | vite/tsx, drizzle-kit, router plugin, mcp  | dev server    | needs upstream releases; Windows-only for the low one  |
| minimatch         | moderate     | eslint, typescript-eslint                  | dev/lint only | needs a major (11); not applied                        |

## Approvals still required (nothing below has been done)

1. Create one draft and confirm whether its database is isolated; otherwise authorize the
   live shared backend for permanent synthetic records.
2. Confirm email sign-up/confirmation settings and two team-controlled test mailboxes.
3. Owner creates `P48_SYNTHETIC_DEMO`, Synthetic Crew A/B and two crew_self invites in Mission
   Operations; each test account accepts its own invite.
4. Set `P48_SYNTHETIC_INTAKE_ENABLED=true` for the demonstration window only.
5. Each account submits its scenario (6 permanent records each); then acceptance steps C–E
   of the contract with real sessions, operator revocation of A, and mission closure.
6. Edge/Chrome and a physical phone, including notification permission, by a person.

## Limitations

- Real signed-in acceptance has not run; browser checks used stubbed responses.
- Revocation is not reflected while a tab stays continuously visible; the next return,
  sign-in change, scope change or request fails closed (RLS remains the enforcement point).
- Client-side the panel is hidden for ineligible users, but any crew_self can still call the
  existing RPC directly for their own crew, as before P48; the server flag gates only this
  app path.

# Repository Structure

```text
.github/
  workflows/quality.yml       CI quality gate
.lovable/
  project.json                Lovable project metadata
public/
  favicon.png                 public icon
  manifest.webmanifest        PWA manifest foundation
  robots.txt                  crawler directives
src/
  app/                        application-layer boundary
  assets/                     visual assets
  components/                 public shell and reusable UI
  domain/                     P3 canonical health/science contracts + tests
  hooks/                      reusable React hooks
  infrastructure/             runtime/infrastructure configuration
  integrations/
    device-adapters/          P5 vendor-neutral adapter SDK + reference fixture
    wearables/                P6 BLE/mobile-health/vendor-cloud adapters
    medical-lab/              P7 FHIR/CSV/manual/medical-device ingestion
    environmental-telemetry/  P8 habitat/environment + radiation adapters
    supabase/                 generated/current Supabase client boundary
  lib/                        shared technical utilities
  routes/                     TanStack Start routes
  router.tsx                  router initialization
  server.ts                   server entry/wrapper
  start.ts                    application start integration
  styles.css                  global design system/styles
tests/
  domain/                     P3 synthetic domain-contract tests
supabase/
  config.toml                 Supabase project configuration; no P3 schema migrations
AGENTS.md                      Lovable/Git collaboration constraints
CODE_OF_CONDUCT.md             contributor conduct
CONTRIBUTING.md                contribution rules
CITATIONS.md                   scientific/resource registry
LICENSE                        Apache-2.0
README.md                      project overview and setup
SECURITY.md                    vulnerability reporting policy
.env.example                   safe environment template
bun.lock                       deterministic dependency lockfile
package.json                   scripts and dependencies
```

Generated files such as `src/routeTree.gen.ts` should not be manually edited unless the framework specifically requires it.

- `docs/CANONICAL_HEALTH_DATA.md` — P4 canonical metric/ingestion/round-trip contract.
- `docs/SCIENTIFIC_BASELINE_V1_1.md` — reviewed biologist baseline decisions and traceability hash.
- `scripts/verify-p4.mjs` — P4 structural/safety verifier.
- `tests/domain/p4-canonical-data.test.ts` — canonical registry, unit, round-trip, series and safety tests.

- `docs/DEVICE_ADAPTER_SDK.md` — P5 adapter lifecycle, safety and normalization boundary.
- `scripts/verify-p5.mjs` — P5 structural/safety verifier.
- `tests/integrations/p5-device-adapter-sdk.test.ts` — adapter lifecycle and P4 normalization tests.

- `docs/WEARABLES_INTEGRATION.md` — P6 source classes, bridge boundaries and safety constraints.
- `scripts/verify-p6.mjs` — P6 structural/safety verifier.
- `tests/integrations/p6-wearables-integration.test.ts` — BLE, Health Connect, HealthKit and vendor-cloud conformance tests.

- `src/integrations/medical-lab/` — P7 FHIR/CSV/manual biomarker and medical-device ingestion boundary.
- `tests/integrations/p7-medical-lab-integration.test.ts` — P7 provenance, fail-closed mapping and medical-device canonicalization tests.
- `docs/MEDICAL_LAB_INTEGRATION.md` — P7 integration and safety contract.

- `src/integrations/environmental-telemetry/` — P8 habitat/environment and personal-radiation telemetry boundaries.
- `tests/integrations/p8-environmental-radiation.test.ts` — P8 canonicalization, context, fail-closed and Gy/Sv separation tests.
- `docs/ENVIRONMENTAL_RADIATION_TELEMETRY.md` — P8 integration and safety contract.
- `scripts/verify-p8.mjs` — P8 structural/safety verifier.

- `src/app/live-dashboard/` — P9 mission-local dashboard state, freshness and timeline contracts.
- `src/components/live-dashboard.tsx` — astronaut-facing live console and direct BLE heart-rate connection UI.
- `src/routes/mission.live.tsx` — `/mission/live` route and canonical metadata.
- `tests/app/p9-live-dashboard.test.ts` — deterministic live/stale/disconnected, trend and self-check tests.
- `docs/LIVE_DASHBOARD.md` — P9 scope, source alignment and persistence/safety boundaries.

### P10 personal baseline

- `src/domain/baseline/` — phase-aware baseline contracts, profile construction and personalized comparison.
- `tests/domain/p10-personal-baseline.test.ts` — minimum-data, rolling-window, phase-selection, context and dashboard-delta tests.
- `scripts/verify-p10.mjs` — P10 structural/safety gate.
- `docs/PERSONAL_BASELINE_ENGINE.md` — scientific and implementation boundary for personal baselines.

### P11 cognitive & behavioral module

- `src/domain/cognitive-behavioral/` — governed assessment contracts, scoring and canonical ingestion.
- `src/app/readiness-assessment/` — readiness workflow state; accepted P11 records can cross the P14 encrypted local persistence boundary.
- `src/components/readiness-assessment.tsx` — astronaut-facing <3-minute demo flow plus optional task-linked workload capture.
- `src/routes/mission.readiness.tsx` — `/mission/readiness` route.
- `tests/domain/p11-cognitive-behavioral.test.ts` — scientific/safety/flow gates.
- `docs/COGNITIVE_BEHAVIORAL_MODULE.md` — P11 implementation boundary.

### P12 Health Intelligence v1

- `src/domain/health-intelligence/` — governed trend detection, reviewed multi-signal patterns, confidence decomposition and explainable findings.
- `src/components/health-intelligence.tsx` — P12 explainability/safety surface; never fabricates session evidence.
- `src/routes/mission.intelligence.tsx` — `/mission/intelligence` route.
- `tests/domain/p12-health-intelligence.test.ts` — deterministic P12 safety and explainability tests.
- `scripts/verify-p12.mjs` — structural/scope P12 gate.
- `docs/HEALTH_INTELLIGENCE_V1.md` — P12 scientific and software boundary.

### P13 Action & Protocol Guidance

- `src/domain/action-guidance/` — bounded protocol library, finding-to-action mapping, governed escalation and acknowledgement contracts.
- `src/components/action-guidance.tsx` — astronaut-facing protocol-library/safety surface; does not fabricate active findings.
- `src/routes/mission.guidance.tsx` — `/mission/guidance` route.
- `tests/domain/p13-action-protocol-guidance.test.ts` — P13 safety, mapping, escalation and acknowledgement tests.
- `scripts/verify-p13.mjs` — P13 structural/scope gate.
- `docs/ACTION_PROTOCOL_GUIDANCE.md` — P13 source alignment and non-diagnostic action boundary.

### P14 offline mission mode

- `src/domain/offline-mission/` — offline event, conflict and protocol-cache contracts.
- `src/infrastructure/offline/` — AES-GCM, IndexedDB store, sync queue/runtime and service-worker registration.
- `src/components/offline-mission.tsx` / `src/routes/mission.offline.tsx` — offline readiness/status surface.
- `public/sw.js` — public shell/assets offline cache; no health API caching.
- `tests/offline/p14-offline-mission.test.ts` — encryption, append-only, reconnect, conflict and protocol-cache gates.

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

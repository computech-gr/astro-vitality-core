# Architecture

## Current P2 architecture

The repository establishes boundaries before health-domain functionality is implemented.

```text
routes / public presentation
        ↓
components
        ↓
application boundary (src/app)
        ↓
domain boundary (src/domain)
        ↓
integrations / infrastructure
```

These are dependency-direction intentions, not claims that all future layers are already populated.

## Presentation and routes

`src/routes/` contains TanStack Start routes and route metadata. `src/components/` contains reusable UI and the current public application shell.

Presentation code may display domain outputs in later phases, but must not become the home for sensor normalization, clinical thresholds, baseline algorithms, or alert reasoning.

## Application layer

`src/app/` is reserved for use cases, orchestration, and application workflows. It will coordinate domain behavior without owning vendor-specific transport details.

## Domain layer

`src/domain/` is reserved for vendor-neutral health, mission, observation, baseline, quality, alert, and protocol concepts introduced in governed later phases.

The domain must remain independent from Apple, Garmin, Fitbit, Supabase, MQTT, or any other concrete provider.

## Integrations

`src/integrations/` contains external-system boundaries. The repository currently contains generated Supabase integration scaffolding. Future adapters may include BLE, Health Connect, HealthKit bridges, laboratory imports, and environmental telemetry.

## Infrastructure

`src/infrastructure/` contains runtime/configuration concerns. `config.ts` owns the canonical-origin rule and prevents Lovable preview hosts from becoming canonical production URLs.

## Future device adapter boundary

Future device adapters are expected to expose a common contract covering discovery/connection where relevant, capabilities, streaming/import, data quality, normalization, resume cursors, and device/adapter health.

Device-specific representations must be normalized before core health-domain analysis.

## Future canonical health model

Later phases will introduce a canonical observation model with explicit:

- subject and mission context;
- device/source provenance;
- metric code and unit;
- timestamp and sampling metadata;
- quality/artifact metadata;
- raw-versus-derived distinction;
- synchronization state.

FHIR-compatible semantics may be used for clinical interchange while high-frequency signals retain an efficient time-series representation.

## Safety boundary

The architecture distinguishes deterministic reviewed safety rules from experimental analytics. No autonomous diagnosis is part of P2 or implied by the public shell.

# Architecture

## Current P3 architecture

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

`src/domain/` now contains the P3 vendor-neutral contracts for mission context, observations, health-signal taxonomy, data quality, provenance, scientific signal definitions, and personal-baseline definitions, plus deterministic validation and synthetic tests.

The domain must remain independent from Apple, Garmin, Fitbit, Supabase, MQTT, persistence schemas, or any other concrete provider. P3 does not yet implement alert reasoning, clinical thresholds, diagnosis, or treatment logic.

## Integrations

`src/integrations/` contains external-system boundaries. The repository currently contains generated Supabase integration scaffolding. Future adapters may include BLE, Health Connect, HealthKit bridges, laboratory imports, and environmental telemetry.

## Infrastructure

`src/infrastructure/` contains runtime/configuration concerns. `config.ts` owns the canonical-origin rule and prevents Lovable preview hosts from becoming canonical production URLs.

## Future device adapter boundary

Future device adapters are expected to expose a common contract covering discovery/connection where relevant, capabilities, streaming/import, data quality, normalization, resume cursors, and device/adapter health.

Device-specific representations must be normalized before core health-domain analysis.

## Canonical health model

P3 introduces a canonical observation model with explicit:

- subject and mission context;
- device/source provenance;
- metric code and unit;
- timestamp and sampling metadata;
- quality/artifact metadata;
- raw-versus-derived distinction;
- synchronization state.

The metric contract can carry optional external coding-system metadata so later FHIR-compatible interchange can be added without making FHIR the internal domain model. High-frequency persistence strategy remains a later-phase concern.

## Safety boundary

The architecture distinguishes deterministic reviewed safety rules from experimental analytics. No autonomous diagnosis is part of P3 or implied by the public shell or domain contracts.

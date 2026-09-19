# Architecture

## Current P4 architecture

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

`src/domain/` contains the P3 vendor-neutral crew/mission and observation contracts plus the P4 reviewed metric registry, governed unit-normalization boundary, scalar-ingestion pipeline, raw-series contracts, interpretation-layer separation, serialization round-trip, deterministic validation, and synthetic tests.

The domain remains independent from Apple, Garmin, Fitbit, Supabase, MQTT, persistence schemas, or any other concrete provider. P4 does not implement alert reasoning, clinical thresholds, diagnosis, treatment logic, or database persistence.

## Integrations

`src/integrations/` contains external-system boundaries. The repository currently contains generated Supabase integration scaffolding. Future adapters may include BLE, Health Connect, HealthKit bridges, laboratory imports, and environmental telemetry.

## Infrastructure

`src/infrastructure/` contains runtime/configuration concerns. `config.ts` owns the canonical-origin rule and prevents Lovable preview hosts from becoming canonical production URLs.

## Future device adapter boundary

Future device adapters are expected to expose a common contract covering discovery/connection where relevant, capabilities, streaming/import, data quality, normalization, resume cursors, and device/adapter health.

Device-specific representations must be normalized before core health-domain analysis.

## Canonical health model

P3 introduced the observation envelope; P4 adds a reviewed metric catalogue and explicit ingestion/serialization behavior with:

- subject and mission context;
- device/source provenance;
- metric code and unit;
- timestamp and sampling metadata;
- quality/artifact metadata;
- raw-versus-derived distinction;
- synchronization state.

The metric contract can carry optional external coding-system metadata so later FHIR-compatible interchange can be added without making FHIR the internal domain model. High-frequency persistence strategy remains a later-phase concern. ECG/vector data use a separate raw-series chunk contract instead of being forced through scalar observation ingestion.

The reviewed scientific source is `SPACE_APPS_2026_Astronaut_Biomarker_Matrix_v1.1.xlsx`; see `SCIENTIFIC_BASELINE_V1_1.md` and `CANONICAL_HEALTH_DATA.md`.

## Safety boundary

The architecture distinguishes deterministic reviewed safety rules from experimental analytics. No autonomous diagnosis is part of P4 or implied by the public shell or domain contracts.

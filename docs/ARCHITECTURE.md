# Architecture

## Current P8 architecture

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

`src/integrations/` contains external-system boundaries. The repository currently contains generated Supabase integration scaffolding. Implemented integration boundaries now include the P5 device SDK, P6 wearables, P7 medical/laboratory inputs, and P8 environmental/radiation telemetry. Future concrete vendor/mission transports remain outside the domain layer.

## Infrastructure

`src/infrastructure/` contains runtime/configuration concerns. `config.ts` owns the canonical-origin rule and prevents Lovable preview hosts from becoming canonical production URLs.

## Universal device adapter boundary

P5 implements the common device-adapter SDK under `src/integrations/device-adapters/`. Adapters expose discovery, connection, capabilities, streaming/import, quality, normalization, resume cursors, clock metadata, health and disconnect semantics.

Vendor representations must pass through the governed P4 canonical metric registry and ingestion/series validation before core health-domain analysis. Unknown vendor metrics fail closed. The included reference adapter is a deterministic conformance fixture, not a real-device integration or product simulator.

## Wearables integration pack

P6 adds concrete source-class implementations above the P5 SDK:

- standard Web Bluetooth Heart Rate Service ingestion;
- host/native bridges for Android Health Connect and Apple HealthKit;
- vendor-cloud history import through an injected authorized client.

All three paths remain outside the domain layer and normalize through P5 into the reviewed P4 canonical registry. Browser code does not pretend to have direct access to native Health Connect or HealthKit APIs, and vendor credentials/OAuth tokens are deliberately owned outside the adapter.

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

## P7 medical and laboratory boundary

`src/integrations/medical-lab/` handles periodic biomarker and medical-device inputs. CSV, explicitly mapped FHIR Observations, manual transcription fallback, SpO2 and blood-pressure readings all converge on the P4 canonical ingestion boundary. Imported reference intervals remain contextual metadata and are never promoted automatically to personal baselines or mission operational limits.

## P8 environmental and radiation boundary

`src/integrations/environmental-telemetry/` adds habitat/environment telemetry and personal dosimetry above the P5 adapter lifecycle. MQTT, WebSocket and REST transport clients are injected by the host runtime, while credentials remain outside the adapter. Environmental observations preserve compartment/location context; dosimetry preserves detector/radiation-field context. All accepted values still pass through the reviewed P4 registry and unit-normalization boundary. P8 explicitly keeps absorbed dose and dose-equivalent quantities separate and introduces no operational thresholds or biological-risk model.

## P9 astronaut live dashboard

The astronaut live UI consumes accepted canonical observations after the adapter/ingestion boundary. It may update directly from a local device stream without a cloud round-trip. Technical freshness, source connection and data quality are always visible. Missing streams are never silently imputed. P9 does not own baseline interpretation, alerts, database persistence or offline synchronization.

## P10 personal baseline layer

The canonical observation layer now feeds a separate personal-baseline engine. Baseline profiles are versioned distributions scoped to one crew member, mission, canonical metric, context policy and adaptation phase. Pre-flight profiles remain immutable; launch/transition continues to use the pre-flight comparator; stable mission may use an explicitly governed rolling baseline after minimum-data gates. Baseline deltas remain separate from clinical reference intervals and mission operational limits and do not themselves create alerts.

## P11 cognitive & behavioral boundary

P11 adds a privacy-sensitive assessment boundary for fatigue, KSS sleepiness, state stress, task-linked workload, and cognitive task results. Assessment outputs enter the P4 canonical observation model with scientific-baseline v1.1 provenance. The module does not produce psychiatric diagnoses, fitness-for-duty labels, autonomous readiness scores, or protocol actions. Practice effects, protocol version and device/input latency are explicit measurement context. The `/mission/readiness` demo is session-only; persistence remains deferred to P14.

## P12 — Health Intelligence v1

P12 adds an explainable domain boundary above canonical observations, personal baselines and cognitive/environmental context. Governed trend policies feed evidence into reviewed v1.1 multi-signal definitions. The engine exposes confidence decomposition, missing context, confounders and uncertainty and does not provide diagnosis, treatment or protocol action. P13 remains the action/protocol boundary.

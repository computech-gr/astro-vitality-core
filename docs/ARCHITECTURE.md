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

P11 adds a privacy-sensitive assessment boundary for fatigue, KSS sleepiness, state stress, task-linked workload, and cognitive task results. Assessment outputs enter the P4 canonical observation model with scientific-baseline v1.1 provenance. The module does not produce psychiatric diagnoses, fitness-for-duty labels, autonomous readiness scores, or protocol actions. Practice effects, protocol version and device/input latency are explicit measurement context. The `/mission/readiness` demo now crosses the P14 encrypted local persistence boundary for accepted check-ins/results and queues them for governed synchronization.

## P12 — Health Intelligence v1

P12 adds an explainable domain boundary above canonical observations, personal baselines and cognitive/environmental context. Governed trend policies feed evidence into reviewed v1.1 multi-signal definitions. The engine exposes confidence decomposition, missing context, confounders and uncertainty and does not provide diagnosis, treatment or protocol action. P13 remains the action/protocol boundary.

## P13 — Action & Protocol Guidance

P13 adds the governed `ACT` boundary above P12 findings. `src/domain/action-guidance/` maps reviewed, non-diagnostic findings to versioned action/protocol categories while preserving finding evidence, uncertainty, confounders and protocol provenance. Research-only findings cannot generate operational actions; data-quality states route to repeat/quality checks. Medical escalation cannot be inferred from a pattern and requires a separately governed trigger carrying authority, version and reason code. Acknowledgement is a versioned domain record; P14 provides its encrypted local persistence/sync boundary while ground audit durability remains part of the authorized backend/ground work.

## P14 offline mission runtime

The local edge runtime now includes an encrypted IndexedDB event store, versioned protocol cache, sync queue and deterministic conflict resolver. Live BLE observations, P9 self-checks and P11 readiness records can cross the encrypted local persistence boundary. P12/P13 remain local deterministic modules. A public-shell service worker supports disconnected navigation without caching health API responses. Remote persistence remains behind a transport contract until the authorized backend/RLS boundary is introduced.

## P15 ground/research boundary

P15 adds mission-scoped cloud persistence, forced-RLS role separation, append-only audit events, an authenticated store-and-forward RPC and a de-identified research export RPC. The ground console is not anonymous and does not move cloud services into the sensor-to-astronaut critical path.

## P16 security boundary

The connected mission path is now explicitly threat-modeled from sensor/browser collection through encrypted local storage, authenticated synchronization, forced-RLS mission persistence, Ground Medical access and pseudonymized research export. Security failures must fail closed and must never be translated into medical conclusions. See `docs/security/THREAT_MODEL.md` and `docs/security/MISUSE_CASES.md`.

## P17 simulation boundary

P17 adds a deterministic synthetic-data boundary above the canonical model. Scenario generators emit only reviewed canonical metric codes and pass every observation through P4 ingestion/unit/quality validation. Synthetic fixtures are explicitly classified and tagged, never replace real device adapters, and never introduce clinical thresholds or causal medical claims. Mission Day 127 also provides deterministic connectivity control events so P14/P15 offline/sync behavior can be replayed without moving cloud services into the sensor-to-astronaut critical path.


## P18 validation boundary

P18 validates the integrated product against the roadmap without turning engineering evidence into clinical validation. Automated gates cover deterministic scenarios, offline/sync, security, data-quality and the <3-minute P11 flow. Keyboard/touch and local latency observations require real browser evidence; target-hardware battery drain remains an explicit limitation until hardware is available.

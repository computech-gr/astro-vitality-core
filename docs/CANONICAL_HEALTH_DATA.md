# P4 Canonical Health Data Platform

P4 defines how heterogeneous mission-health data enters a shared vendor-neutral model before any device-, vendor-, or database-specific representation can affect analytics.

## Reviewed metric registry

The registry is seeded from the reviewed Astronaut Biomarker Matrix v1.1 and intentionally focuses on the challenge MVP and near-term operational set. Research-only rows stay in the scientific source unless a later governed phase explicitly promotes them.

A canonical metric definition carries:

- stable code and display name;
- domain and value kind;
- scalar/event/series/vector shape;
- canonical unit and accepted source aliases;
- cadence class;
- scientific priority and review disposition;
- interpretation tier;
- evidence source IDs;
- source matrix row and scientific-baseline version.

## Scalar observation ingestion

`ingestCanonicalObservation()` validates the metric code and source type, normalizes only explicitly governed units, preserves original source unit/value in provenance, creates the canonical `MetricRef`, and executes the existing observation validator.

The unit layer is fail-closed. If the source unit is scientifically valid but no governed conversion exists, ingestion rejects the value instead of guessing a conversion. This is especially important for analyte-specific laboratory conversions.

## Raw series path

Waveforms and vectors such as ECG and tri-axial acceleration use `RawSignalChunk`, not scalar observation ingestion. Each chunk carries mission/crew context, source identity, sampling rate, channel names, unit, quality, provenance, classification, and context metadata.

## Three interpretation layers

P4 keeps the following objects separate:

1. `PersonalBaselineComparison` — individual longitudinal expectation and deviation.
2. `ClinicalReferenceInterval` — assay/population reference with source metadata.
3. `MissionOperationalLimit` — mission/program rule with explicit authority, source, and version.

`ObservationInterpretation` may reference all three without merging them. Research-only interpretations cannot produce an operational action class.

## Serialization exit gate

The P4 round-trip test serializes a canonical observation envelope, restores it, revalidates it, and proves that canonical unit, source provenance, context, and data-quality metadata are preserved.

## Deliberate exclusions

P4 does not add:

- clinical thresholds or diagnoses;
- alert/pattern reasoning;
- baseline algorithms;
- device adapter implementations;
- database migrations or persistence schema;
- autonomous action guidance.

These remain downstream responsibilities. P4 provides the stable data language those capabilities must consume.

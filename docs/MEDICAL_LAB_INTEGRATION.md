# Medical & Laboratory Integration — P7

P7 adds governed periodic medical and laboratory ingestion without inventing clinical meaning.

## Supported paths

- **CSV laboratory import** with required canonical metric code, numeric value, unit and observation time.
- **FHIR Observation / Bundle import** using an explicit external-code → reviewed canonical metric map. Unknown terminology fails closed; the importer does not guess LOINC or other clinical semantics.
- **Manual biomarker entry fallback** for onboard or externally produced results when no machine interface is available. The original source label remains mandatory and provenance is `manual`.
- **Medical-device bridge** for SpO2 and systolic/diastolic blood pressure readings. These readings still pass through the P4 canonical registry, unit normalization and validation boundary.

## Provenance and presentation

A periodic biomarker result carries source system, import format, observation time, specimen metadata where available, assay/method text and canonical review status. `labResultViewModel()` exposes a UI-independent presentation model so later astronaut/ground workflows can display the value together with provenance instead of a context-free number.

## Safety rules

1. Personal baseline, laboratory reference interval and mission operational limit remain separate structures.
2. Reference intervals imported from FHIR/CSV are context only; they do not automatically become alert thresholds.
3. FHIR code mapping is explicit and versionable. No terminology is inferred from display text.
4. Manual transcription never masquerades as machine-originated data.
5. Unreviewed metrics are rejected at the canonical boundary.
6. No diagnosis or treatment recommendation is produced by P7.
7. Public tests use synthetic values only.

## Persistence boundary

P7 defines ingestion and provenance contracts only. Database persistence is intentionally not introduced by this patch. Online persistence, mission isolation/RLS, local offline persistence and later synchronization are separate governed capabilities. Live wearable/medical values can already normalize into the canonical model; the P9 dashboard will consume live streams, while P14 provides resilient local persistence and store-and-forward synchronization.

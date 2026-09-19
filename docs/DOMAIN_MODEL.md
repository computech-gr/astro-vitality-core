# P3/P4 Identity, Mission, Crew & Canonical Health Domain Model

P3 introduces the first executable, vendor-neutral health-data contracts for The
Mitochondria. The purpose is to create a stable language for later device,
mission, storage, analytics, and UI work before any one vendor or database shape
can become the de facto domain model.

## Canonical observation

A `CanonicalObservation` binds together:

- mission and crew-member references;
- source identity and adapter provenance;
- a metric code, domain, value kind, and explicit unit where numeric;
- observation time and optional effective interval;
- data-quality state, score, artifacts, and notes;
- raw, derived, or manual provenance;
- sensitivity classification;
- tags for non-clinical operational grouping.

Derived observations must name both their derivation method and their input
observation IDs. Raw/manual observations cannot masquerade as derived data.

## Health-signal domains

The taxonomy is intentionally broader than a biomarker list. It includes
physiological, biological, laboratory, cognitive, behavioral, psychological,
sleep/circadian, activity/performance, nutrition/hydration, environmental,
radiation, symptom-report, and device/system context.

This distinction matters: a psychological assessment, cabin CO2 reading, or
radiation measurement can be operationally important health context without being
misrepresented as a biological biomarker.

## Scientific signal definitions

A `ScientificSignalDefinition` records description, intended use, limitations,
evidence references, review state, version, and a mandatory `nonDiagnostic: true`
boundary in P3. This is governance metadata, not an approval to use the signal for
clinical decisions.

## Personal baselines

P3 defines the metadata needed to describe a reproducible individual longitudinal
baseline. It intentionally does not choose or implement a clinical baseline
algorithm. Later phases must version algorithms, quality policies, evidence, and
validation independently from the data contract.

## Interoperability direction

Metric contracts can carry an optional external coding system/code pair. This
allows later alignment with standards such as HL7 FHIR while keeping the domain
independent of any specific interchange format.

## Identity, mission, and crew closure

P3 also defines vendor-neutral `CrewMember`, `Mission`, and `CrewAssignment` contracts. These establish stable identifiers and mission membership without coupling the domain to Supabase Auth or any identity provider. Assignment intervals are explicitly validated so later observation ingestion can prove that a subject belongs to the referenced mission context. Authentication, authorization, persistence, and RLS remain implementation concerns for later infrastructure work.

## P4 reviewed metric catalogue and ingestion

P4 promotes a reviewed MVP/near-term subset of `SPACE_APPS_2026_Astronaut_Biomarker_Matrix_v1.1.xlsx` into stable canonical metric definitions. Every promoted metric retains its matrix sheet/row, evidence source IDs, review disposition, priority, cadence, interpretation tier, source types, and scientific-baseline version. Rows marked `REMOVE` are excluded.

Scalar/event observations enter through `ingestCanonicalObservation()`. Series/vector signals such as ECG waveform and tri-axial acceleration use `RawSignalChunk`. Unit normalization is fail-closed: only explicitly governed aliases/conversions are accepted, and source unit/value are retained in provenance.

P4 also introduces an `ObservationInterpretation` contract that keeps personal baseline, clinical/laboratory reference interval, and mission operational limit as separate structures. Research-only interpretations cannot emit an operational action class.

## Personal baseline profiles (P10)

A personal baseline is a versioned distribution, not a single reading. It records mission/crew identity, canonical metric, phase, time window, accepted observations, quality/status policies, required context tags, algorithm provenance and summary statistics. Pre-flight profiles are immutable. Launch/transition cannot create a replacement profile. Stable-mission rolling baselines are permitted only when explicitly configured and when minimum-data/coverage gates pass. Comparison results expose longitudinal deltas only; clinical intervals and mission operational limits remain separate governed layers.

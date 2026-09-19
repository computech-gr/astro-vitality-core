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

## P11 cognitive/behavioral measurement

Cognitive/behavioral data is modeled as private longitudinal measurement, not as a diagnosis. P11 introduces task protocols, reaction-time and working-memory trials, fatigue/sleepiness/stress check-ins, task-linked NASA-TLX subscales and schedule context. PVT lapse counting is conditional on an externally governed protocol threshold. Mood/affect is catalogued for future governed collection but is not collected by the demo until a validated item set is selected.

## P12 health-intelligence contracts

`src/domain/health-intelligence/` defines governed trend evidence, reviewed pattern roles, confidence breakdown and `HealthIntelligenceFinding`. Findings preserve contributing observation/source IDs, missing roles/context, confounders, uncertainty, scientific source IDs and interpretation guardrails. `confidence.score` is evidence-completeness confidence, not medical probability or readiness.

## P13 action and protocol contracts

P13 introduces `ProtocolDefinition`, `ActionCard`, `ActionGuidancePlan`, `GovernedEscalationTrigger` and `ActionAcknowledgement`. The governed operational action classes follow Biomarker Matrix v1.1: none, repeat/quality check, recovery/workload review, hydration/nutrition review, exercise review, environmental review and medical escalation. Severity remains separate from diagnosis: `info`, `watch`, `action`, `escalate`, and `data_quality`. Medical escalation requires explicit external governance rather than pattern inference.

## P14 offline mission records

`OfflineEventRecord` is an append-only local envelope for sensitive mission events. Health payloads are encrypted before IndexedDB storage. Sync metadata is separate from encrypted payload content. `SyncComparableRecord` and `resolveSyncConflict()` preserve source version, event timestamp and source priority, failing closed to manual review for unresolved ties.

## P17 synthetic mission contracts

`SyntheticScenarioManifest`, `SyntheticMissionDataset` and `SyntheticMissionEvent` model reproducible demo data separately from real mission records while reusing the canonical observation envelope. Fixed seeds and timestamps make replay deterministic. Observation events retain canonical provenance and `classification: synthetic`; annotation/connectivity events document scenario context without masquerading as health observations.

## P18 validation evidence

`src/domain/validation-usability/` defines validation criteria, evidence states and closure summarization. A critical criterion must be `pass` with timestamped evidence. Noncritical hardware gaps may be `known_limitation`; missing or pending critical evidence fails closed.

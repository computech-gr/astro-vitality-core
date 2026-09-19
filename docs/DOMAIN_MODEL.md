# P3 Canonical Health Domain Model

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

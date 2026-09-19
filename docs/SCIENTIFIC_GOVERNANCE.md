# P3 Scientific Governance Boundary

The Mitochondria is research-oriented decision-support software. P3 creates the
minimum governance contract required before later health logic is added.

## Evidence first

A scientific signal definition must carry at least one traceable HTTPS evidence
reference before it can pass the P3 validator. Evidence references identify what
supports the definition; they do not automatically establish clinical validity.

## Review states

P3 uses four states:

- `draft`
- `evidence_review`
- `approved_for_research`
- `retired`

There is deliberately no `clinical`, `flight_approved`, or `diagnostic` state in
P3. Introducing operational medical logic requires a later, separately governed
phase with qualified scientific/medical review.

## Psychological and behavioral data

Psychological, behavioral, and cognitive signals may be represented when they are
explicitly collected or measured. The platform must not infer psychiatric
diagnoses, personality labels, mental fitness, or medical conclusions from these
signals without a separately reviewed and validated capability.

## Data provenance and quality

Every observation must retain source identity, capture time, ingestion identity,
quality metadata, and raw/derived status. Derived data must name its inputs and
method so a reviewer can reconstruct how it was produced.

## Safety boundary

P3 does not add:

- diagnosis;
- treatment or medication advice;
- clinical thresholds;
- autonomous escalation;
- model-generated safety alarms;
- flight-readiness determinations.

Those capabilities, if ever implemented, require evidence, explicit risk controls,
traceable versions, qualified review, and human-in-the-loop operation.

## Biomarker matrix review state

`SPACE_APPS_2026_Astronaut_Biomarker_Matrix_v1.0.xlsx` is a working scientific input, not an operational rule set. The biology review that will produce v1.1 remains an explicit scientific gate. Until that review is accepted, no biomarker row, reference interval, correlation, directionality, cadence, or proposed action from the workbook may be promoted into hard-coded clinical thresholds or autonomous health decisions.

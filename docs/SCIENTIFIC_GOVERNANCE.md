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

`SPACE_APPS_2026_Astronaut_Biomarker_Matrix_v1.1.xlsx` is the reviewed scientific implementation baseline (review completed 2026-09-19; SHA-256 `ffed3a7f3afb844963900bd53cbb9edd74588f613c925d323fd58ded0cce7273`). The review closes the P1 team-biologist dependency and explicitly separates operational candidates, medical-context signals, research-only measures, and removed duplicates/low-value rows.

The review does **not** authorize clinical thresholds, diagnosis, treatment, or autonomous flight rules. Personal baseline, clinical/reference interval, and mission operational limit remain separate governed layers. Evidence-weighted relationships must expose context, confounders, quality, uncertainty, and non-causal wording where appropriate.

## P10 baseline governance

P10 implements the v1.1 principle that personal longitudinal change is primary while clinical/reference intervals and mission operational limits remain separate. The baseline engine may compute descriptive personalized deltas only for reviewed baseline-enabled metrics and only after explicit data-quality, coverage and context gates. It does not convert delta magnitude into a diagnosis, risk class or action. Circadian-sensitive comparisons require governed upstream context tagging rather than inferred time-of-day assumptions.

## P11 behavioral-health safeguards

The v1.1 matrix governs P11. Repeated named tasks, practice effects, device/input latency, privacy and personal-baseline interpretation are required. Fatigue, KSS sleepiness and state stress are contextual longitudinal measures. NASA-TLX remains task-linked and keeps its six dimensions. Mood/affect collection requires a selected governed instrument. No cognitive or behavioral measure may be converted into a psychiatric diagnosis, personality inference, readiness classification, or autonomous escalation in P11.

## P12 reviewed relationship governance

Health Intelligence v1 implements only relationships explicitly represented in the reviewed v1.1 scientific baseline. Cross-domain corroboration may increase evidence confidence, while shared artifacts, missing context, confounders and research-only status reduce it. CO2/cognition remains contextual rather than causal; microbiome/immune remains Research Only; no single HRV/EDA/cortisol or urine-specific-gravity value is converted into a diagnosis. New thresholds or causal relationships require claim-specific evidence and scientific/medical governance.

## P13 protocol/action governance

Biomarker Matrix v1.1 review item 11 allows bounded action categories: repeat measurement/quality check, workload/recovery review, hydration/nutrition review, exercise-countermeasure review, environmental correction/review and medical escalation. P13 encodes these as versioned protocol categories, not treatments. A reviewed P12 pattern can select only the approved non-diagnostic category mapping. Research-only findings remain non-operational. Medical escalation requires a separately governed authority/versioned trigger and cannot be inferred from a pattern alone. Action acknowledgements preserve protocol provenance for later P14/P15 persistence/audit work.

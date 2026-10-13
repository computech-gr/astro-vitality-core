# P21 — Scientific Knowledge Intake (non-operational)

## Purpose

This stage creates a controlled intake boundary for additional team-biologist knowledge. It does **not** authorize new operational patterns, thresholds, diagnoses, guidance, or readiness decisions.

## Existing governance

- Biomarker Matrix v1.1 remains the reviewed implementation baseline.
- P12 Health Intelligence uses reviewed non-diagnostic patterns; P13 guidance remains separately governed.
- Scientific claims must distinguish association from causation, record context/confounders and identify evidence limitations.

## Intake procedure

1. Record each claim in `data/scientific/knowledge-intake.v1.json` with a stable identifier, original source, exact claim, evidence URLs and author/reviewer metadata.
2. Compare each claim to Biomarker Matrix v1.1 and existing P12 definitions. Identify duplication, contradiction, changed interpretation and missing measurement capability.
3. Assign `draft`, `evidence_review`, `approved_for_research`, or `retired` only after review; never treat `approved_for_research` as clinical or flight authorization.
4. Classify the proposed impact as `reference_only`, `candidate_metric`, `candidate_relationship`, or `candidate_protocol`.
5. Implement operational code only in a separate reviewed patch with claim-specific evidence, quality gates, context, provenance and focused tests.

## Acceptance boundaries

- The intake JSON is documentation/data only and is not imported by runtime modules.
- An empty claim collection is intentional until actual biologist contributions arrive.
- No scientific conclusion is fabricated by this patch.

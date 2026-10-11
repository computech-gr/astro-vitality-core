# P21.13 — Scientific Relationship Assessment & Decision Matrix

This stage introduces a **decision queue**, not a scientific decision or a clinical algorithm. All 16 biological relationships from P21.5 are linked by stable ID to the P21.6 evidence appraisal and P21.12 quantitative backlog. No literature quality grade, verified effect size, reviewer sign-off, or clinical authorization is asserted.

## Independent review requirements

For each relationship, a domain reviewer must assess population (ISS vs bed-rest analog), specimen and assay compatibility (e.g. urinary versus serum CTX), DXA vs QCT modality, temporality, confounding, contradictory evidence, effect size and uncertainty, and whether a statement is merely educational. No unreviewed relationship is eligible for astronaut-facing interpretation or action guidance.

The `assessmentFlags` field captures caution topics; it is **not** a conclusion of a completed review. `sourceExplanation` is inherited from the earlier reference-only graph and does not imply endorsement. No inferred relationship is causally established.

## NASA challenge alignment

Gather/Evaluate/Act/Follow-up remains the target product workflow. This patch **does not implement** that workflow and does not add runtime health recommendations. Future action guidance must be explicitly governed and non-diagnostic; escalation is to approved crew medical protocols rather than an invented treatment plan.

## Verify

`node scripts/verify-p21-relationship-decisions.mjs`

The verifier checks structural alignment and non-activation only. It cannot establish scientific validity.

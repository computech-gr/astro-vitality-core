# P12 — Health Intelligence v1

P12 introduces the explainable intelligence boundary. It does **not** introduce diagnosis, treatment, protocol execution, mission medical thresholds, or autonomous escalation.

## Source governance

The implementation follows the controlled scientific sources:

- `SPACE_APPS_2026_Astronaut_Biomarker_Matrix_v1.1.xlsx`
- `SPACE_APPS_2026_Scientific_System_Architecture_v1.0`
- `SPACE_APPS_2026_Master_Development_Roadmap_v1.0`

The reviewed matrix requires multi-signal relationships to preserve direction, time window, required context, evidence strength and confounders. Cross-domain corroboration may increase confidence, but the engine must not use a simple count of abnormal values or causal language unsupported by evidence.

## Engine boundary

P12 contains four separate concepts:

1. **Governed trend detection** — persistence/rate logic requires an explicit caller-supplied policy and authority. P12 ships no universal physiological or clinical numeric thresholds.
2. **Reviewed pattern definitions** — roles, supported metric families, source IDs and guardrails derived from the v1.1 scientific review.
3. **Confidence decomposition** — independent domains/sources and good-quality evidence increase confidence; poor quality, missing context, confounders, missing roles and limited/research evidence reduce it.
4. **Explainable finding** — carries what changed, why it matched, missing data, confounders, uncertainty, evidence and guardrails.

## Reviewed v1.1 patterns included

- sleep / fatigue / cognition
- workload / recovery / autonomic context
- hydration / volume / orthostatic context
- CO2 + symptom/cognitive change as **contextual, non-causal** evidence
- bone unloading / renal-stone context over long horizons
- microbiome / immune relationship as **Research Only**

These are pattern definitions, not diagnoses.

## Confidence is not a clinical probability

The `confidence.score` is an explainability aid describing the completeness/quality of the evidence supplied to a pattern evaluation. It is not disease probability, risk probability, readiness score, fitness-for-duty score or medical certainty.

The UI must show the breakdown and uncertainty reasons rather than presenting the score alone.

## Safety rules

- No single HRV, EDA or cortisol value becomes a "stress" diagnosis.
- No urine-specific-gravity-only dehydration diagnosis.
- No radiation attribution from nonspecific oxidative biomarkers.
- No microbiome healthy/unhealthy or dysbiosis score.
- No causal CO2 → cognition statement at routine spacecraft levels.
- No collapsing Gy and Sv into one quantity.
- Research-only relations never enter operational alerting by default.
- Poor/unknown-only evidence produces `data_quality`, not a health alert.
- P13 is responsible for protocol/action/severity/acknowledgement semantics.

## P12 route

`/mission/intelligence` presents the scientific boundary, reviewed pattern catalogue and current session state. It intentionally displays no health finding when no evidence is available and never manufactures demo physiology.

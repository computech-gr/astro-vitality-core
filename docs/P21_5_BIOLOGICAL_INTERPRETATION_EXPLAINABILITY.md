# P21.5 — Biological Interpretation & Explainability (reference-only)

This patch adds a curated **relationship reference graph** for 16 biological/contextual links from the team's Bone Health Handbook v7. It does **not** add a diagnostic or clinical inference engine. The graph is **not** an independently reviewed literature synthesis: every edge is explicitly marked `pending_independent_review` and must be evaluated by a qualified reviewer against primary evidence before any operational use.

## Interpretation boundaries

- CTX (bone-001) and P1NP (bone-009) describe different aspects of bone turnover. A CTX change of +30% **does not mean** 30% bone loss.
- DXA aBMD (bone-043) is site- and modality-specific; do not combine it with QCT vBMD (bone-046). BMD retention is **not** fracture risk.
- Renal supersaturation (bone-038) cannot be inferred from a single urine constituent; it requires an independently validated model and all required inputs.
- Mission duration, microgravity, exercise and nutrition are contextual exposures, not proof of causation.
- Comparable longitudinal trends require method, assay, specimen, unit, imaging site/modality, timepoint, collection protocol and QC metadata.

## Governance and scope

`data/scientific/bone-health-interpretation-graph.v1.json` references the 63-entry catalog and 63-entry independent review ledger. All links are reference-only; no UI display, scoring, alert, ingestion mapping, new database objects, thresholds or patient/crew advice is activated. The existing P21.1–P21.4 artifacts remain authoritative for their respective stages. Independent evidence review is still required before promoting an edge.

Run the focused check with `node scripts/verify-p21-bone-interpretation.mjs`. The check validates ID integrity and safety flags, **not** biological correctness or clinical validity. It is included in the project's `check` command but does not require a full check run during patch application.

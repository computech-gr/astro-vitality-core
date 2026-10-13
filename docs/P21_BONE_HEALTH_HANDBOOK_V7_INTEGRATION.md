# P21.1 — Bone Health Handbook v7: reviewed intake boundary

Source: team-uploaded **Astronaut_Bone_Health_Handbook_v7_BIOLOGY_FOR_DEVELOPERS_GR.docx**. The SHA-256 in the catalog identifies the exact reviewed source.

## What was imported

- 63 variable rows, preserving the original Greek handbook's measurement description, directionality and software notes.
- Six source sections: resorption, formation, calcium/endocrine, urine/stones, imaging/strength, exercise/nutrition/exposure.
- Source-assigned A/B/C tiers **are not** independent NASA/clinical validation. Every row remains `pending_independent_review` and `reference_only`.
- P21 intake source registry points to this catalog; existing `claims` remain unchanged.

## Safety and implementation contract

- No runtime import, DB migration, UI, algorithm, readiness decision, clinical threshold or new medical recommendation.
- Compare biomarkers only with compatible assay, specimen, units, time-of-day/fasting context and individual baseline.
- Imaging: preserve anatomical site, modality, machine, precision; never mix DXA aBMD and QCT vBMD.
- CTX +30% means marker increase, **not** 30% bone loss. DXA 94% retention is **not** a fracture-risk probability.
- Calcium/urine context does not license a renal-stone risk score or supersaturation model.
- Before operational activation: map each metric to Biomarker Matrix v1.1 and P4 registry, deduplicate names, verify primary evidence, add method/quality/provenance fields, scientific sign-off, tests and synthetic/demo labeling.

## Source-to-catalog integrity

Run `node scripts/verify-p21-bone-catalog.mjs`. The verifier checks 63 unique IDs, six groups, pending-review state, intake link and explicit no-activation. It does not independently validate biology.

# P21.2 — Bone Health Handbook v7 × Canonical Metric Registry

This patch carries forward the complete P21.1 scientific catalog because the supplied project ZIP contains P21 intake but **does not yet contain the P21.1 catalog**. It adds a read-only, 63-row mapping review; no runtime imports, migrations, algorithms, UI or clinical decisions.

## Mapping disposition

- **candidate_exact (6)**: CTX, P1NP, 25(OH) vitamin D, urine volume, dietary protein intake and fluid intake. These are _candidates_, not verified assay/unit/time equivalences.
- **related_not_equivalent (5)**: urinary creatinine vs serum creatinine, resistance adherence/load vs general exercise load, mission duration vs phase, microgravity exposure vs gravity regime. **Never merge automatically.**
- **unmapped (52)**: require explicit scientific and engineering review before proposing a canonical metric.

## Review requirements

For each candidate, document specimen, assay, matrix row, unit and conversion semantics, fasting/collection timing, device/source, quality flags, mission phase, baseline compatibility, reviewer, date and primary evidence. Imaging must preserve modality, anatomical site and precision. Supersaturation requires a validated model and sufficient urine chemistry inputs. Never infer fracture risk or clinical thresholds.

The handbook's A/B/C tiers are **author-assigned**. No independent evidence appraisal or biological sign-off is claimed. This mapping is _reference only_. Existing operational registry entries remain unchanged.

Run `node scripts/verify-p21-bone-catalog.mjs` and `node scripts/verify-p21-bone-mapping.mjs`. Both verify structural integrity, not scientific validity.

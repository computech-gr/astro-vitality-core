# P35.4 — Cardiovascular Handbook scientific intake v1.0

Source: `NASA_Cardiovascular_Handbook_Expanded_Biology_GR (2).docx` (SHA-256 recorded in catalog). Source tables yield exactly **96** measurements in seven groups, plus eight examples of combined interpretation and limitations. The catalog transcribes the original Greek measurement names, units, biology, and context; it does not assert that each item is measurable by current sensors.

The existing `/mission/cardiovascular-health` page now exposes a reference-only expandable scientific catalog. Its private Crew Self evidence surface remains governed by existing membership and metric mappings; the handbook does **not** change those mappings or activate any measurements.

## Guardrails

- `pending_independent_review`, `reference_only`, `clinicalActivation: false` throughout. No clinical score, arrhythmia inference from camera PPG, autonomous alert, or treatment recommendation.
- Before comparative analysis require matching measurement units, method/device, posture/activity, mission phase, time, specimen/assay where relevant, QC and reviewed personal baseline.
- Distinguish measured, derived, association, suspected event and clinician-confirmed event. Missing ECG, Doppler or laboratory data means missing, not normal.
- Bone–vascular correlations (CTX/P1NP, urinary calcium, PWV/CAC) are exploratory, not causal.
- The catalog is an intake artifact, not completion of P32 independent scientific review or P35.5.

## Verification

Run `bun test tests/domain/p354-cardiovascular-handbook.test.ts` and the existing full project checks. Check the expanded catalog on desktop and mobile, keyboard navigation, signed-out and Crew Self states. Do not publish without normal review. No migration, no secrets, no health-record mutation.

FV-01-13 OPEN · P32/P34 PENDING · Final Security Gate BLOCKED.

# P54 — Unified Astronaut Health Report assessment

Research use only. Nothing in P54 is a diagnosis, a clinical approval or a scientific validation.

## What changed

- **Biomarker health assessment** (`src/domain/health-intelligence/biomarker-health-assessment.ts`):
  one deterministic, offline read model shared by the report screen, module interpretation series,
  searchable PDF and TXT. For each included biomarker it shows the current result, the previous
  comparable result (same exact ID and unit), the neutral change, the classification basis, the
  approved interpretation (or "pending scientific review"), citations, evidence quality, reviewer
  status and limitations.
- **Status rules.** RED, AMBER and NORMAL are assigned only from an applicable, independently
  verified reference interval or decision threshold for the exact metric ID, unit and domain
  (`data/scientific/verified-reference-intervals.v1.json`), or from an already-validated approved
  adverse rule annotation. Everything else is NEUTRAL with an explicit reason. Units are never
  converted, increases/decreases are never judged without a reference, differing repeat readings
  and ambiguous units stay NEUTRAL, and synthetic-demo references apply only to synthetic data of
  their own mission.
- **Accessible severity.** Every status is an icon plus a text label plus colour; the PDF and TXT
  carry the same text markers (`(!!) RED`, `(!) AMBER`, `(=) NORMAL`, `(?) NEUTRAL`).
- **Preliminary medical assessment** (`preliminary-medical-assessment.ts`, panel on the report
  screen only): a deterministic offline assessment is always available. An optional AI-assisted
  draft is requested only by the Ground Medical member of the exact mission and crew, only for
  synthetic data, only when the server flag `P54_PRELIMINARY_ASSESSMENT_AI_ENABLED` is `"true"`
  (default off). The packet is de-identified (no names, dates, crew or mission IDs); the server
  re-checks privacy and status integrity and validates the structured output, which must cite
  packet evidence IDs and may not state a confirmed diagnosis. Clinician review (accept / edit /
  reject with reason, SHA-256 of the reviewed content) is session-only and never persisted.
- **P38 bulk researcher workflow** is reused, not duplicated: shared pure selection helpers
  (`p38-bulk-demo-selection.ts`), awaiting-triage and ready counts, full per-item results and
  one-click reselection of failed items. Global Scientific Review links to the existing bulk
  section for the selected mission; the target panel re-checks that the mission is authorized.
  Ground Medical activation stays a separate step.

## Current state

- The verified-reference registry is intentionally empty: no interval or threshold has
  independent verification evidence yet, so every live biomarker is NEUTRAL.
- Browser check (synthetic crew account, throwaway browser): Alex Morgan exam imported (80 rows
  saved locally), report showed 79 biomarkers all NEUTRAL with reasons, the preliminary assessment
  stated that no diagnosis can be established, and the TXT and 60-page PDF carried the same
  section.

## Not done / owner decisions

- Adding verified reference intervals requires independent verification evidence per exact
  biomarker, unit, domain, population and applicability.
- Enabling the AI-assisted assessment requires the owner to set the server flag. The server
  cannot prove that submitted data is synthetic (missions have no synthetic flag); the flag must
  stay off for any real data.
- The Ground Medical review screen and the Global Review link were not exercised in a signed-in
  Ground Medical or Researcher browser session.
- No database changes, approvals, activation, publication or deployment.

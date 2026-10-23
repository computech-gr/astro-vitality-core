# P41 — Independent Scientific Review Workbook

## Purpose

P41 provides a **human-editable review handoff** for the 216 P40 pending scientific records. The CSV is a snapshot, not an authoritative approved catalog or application input. It does not change P37–P40 sources, clinical rules, the UI, database, authentication, or mission workflows.

## How to review

1. Open `data/scientific/p41-independent-review-workbook.v1.csv` in a spreadsheet editor, retaining the `source_id` and original source columns.
2. For each of the 54 proposed links, compare actual analyte/construct, specimen, collection protocol, method, units and reference intervals. A related measure is **not** necessarily an alias. Do not assume that matching names prove equivalence.
3. For the 162 unmapped records, document whether a distinct catalog entry is needed, whether the measurement is derived/contextual, or whether evidence is insufficient. Do not force a mapping.
4. Review longitudinal baseline, environmental and mission-phase context; assess privacy, consent, role-based visibility and quality/missingness handling.
5. Record evidence references, rationale, named independent reviewer and UTC review time before proposing a decision. **Nikolas' authorship does not itself constitute independent approval.**
6. Treat reviewer-edited CSV as a separate proposed decision artifact. The shipped verifier deliberately expects all decisions pending; it must not be relaxed to pass approvals. Approval requires a subsequent governed, independently reviewed release.

## Guardrails

- All 216 rows start `PENDING_INDEPENDENT_SCIENTIFIC_REVIEW`; the 54 P39 mappings are **candidates**, not validated equivalences.
- A blank catalog ID means no curated P39 mapping, not that the source record is invalid.
- `NOT_REVIEWED` checklists are deliberately explicit. The CSV must not be ingested as operational medical data.
- No clinical scoring, diagnosis, thresholds, automatic advice, NASA endorsement, real astronaut data or device validation is claimed.
- P22 airplane-mode offline OCR evidence remains a separate open acceptance gate.

## Validation

Run `node scripts/verify-p41-review-workbook.mjs`, then `bun run check`. No migration or deployment is part of P41.

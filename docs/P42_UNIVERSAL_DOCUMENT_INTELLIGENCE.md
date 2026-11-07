# P42 — Universal Medical Document Intelligence & Adaptive Intake

Status: implemented in Preview. Not published. No database, catalog, approval or historical-observation changes.

## Root cause of the zero-row failure

`Alex_Morgan_Complete_Examination_2026-11-07.pdf` (SHA-256 `d1bd6d9f…cabdfb`) has a selectable text layer. The PDF.js geometry path already rebuilt its 4-column rows (`No. | Measurement | Result | Unit / scale`) correctly, but Unified Intake only offered three line parsers: ISO-timestamp rows, five-column rows with a calendar date, and `Label: value unit`. A numbered 4-column table with no per-row date matches none of them, so every row was discarded and the file reported `no matching candidate rows`. The review table was also capped at 200 rows (the document has 328), and `"1,400"` would have been read as `1.4` by the generic decimal-comma rule.

## Architecture (stages)

| Stage | Where | What |
| --- | --- | --- |
| A Identification | `document-extraction.ts` (unchanged path + geometry cells), `document-table-reconstruction.ts` | pages, text layer vs OCR, patient / record / stated date-time, "simulated data" marker |
| B Layout | `document-table-reconstruction.ts` | header cells mapped to column roles via an explicit English/Greek vocabulary (any order), x-alignment from PDF geometry, delimited text, low-confidence token fallback for OCR, headerless numbered rows |
| C Reconstruction | same | one observation per source row: row number, verbatim label/result/unit, reference/specimen/method columns only when present, P39 section heading, page, line, excerpt; repeats and row-number gaps reported |
| D Normalization | same (`parseResultValue`) | Unicode minus, thousands separators only when the document's own decimal convention proves them, exact scientific notation; categorical, yes/no, clock-time, censored and range results kept verbatim and marked unsupported |
| E Catalog matching | existing `classifyWithGovernedExtensions` | unchanged exact label + exact unit rules |
| F Human review | `document-intake-review.ts`, `intake-review-selection.ts`, `unified-intake-workspace.tsx` | processing summary, identity check, reviewer-applied examination time, filters, accept/reject, bulk selection limited to safely matched rows |

## Alex Morgan results (actual PDF)

- 328 source rows reconstructed, row numbers 1–328 each exactly once; 11 table headers (repeated per page).
- Sections: BONE HEALTH 54, CARDIOVASCULAR HEALTH 94, IMMUNE MONITORING 81, BEHAVIORAL HEALTH 99 (all with page provenance).
- Value types: 316 numeric, 7 yes/no, 4 clock-time, 1 categorical (12 unsupported for numeric storage, kept verbatim).
- Base catalog: 56 matched, 97 unit review required, 175 unknown, 0 ambiguous. In the MITO_DEMO_2026 synthetic scope the mission's activated synthetic demo catalog adds 30 matches (86).
- Repeats kept with provenance: IL-6 144/184, TNF-α 145/190, hsCRP 143/196, 25(OH) vitamin D 18/219, PTH 17/221, Sleep efficiency 210/232. Different-label repeats of one metric (RMSSD 80 / HRV RMSSD 313) are caught by the existing duplicate gate.
- Examination time: `07/11/2026 09:30 UTC` is offered as day/month (`2026-11-07T09:30:00Z`) or month/day; the reviewer chooses. Nothing is applied automatically.

## OCR and AI

- OCR: the existing on-device tesseract.js path with the bundled English pack. A real run on this PDF (150 dpi) recovered 319 of 328 rows, missed 10 row numbers, read one twice and changed 18 values (e.g. lost decimal points). OCR rows are therefore always low-confidence and never bulk-selected. Greek OCR is not available (English pack only).
- On-device AI extraction: not available. The separate server-side AI route stays default-off and is not called by Unified Intake.

## Known limitations

- `IMMUNE MONITORING` is preserved verbatim but not mapped to the Immune domain, because the sealed P39 heading rules (v1) do not list it; adding it is a governed rules-version change.
- Bone rows are mostly "unit review required" against the P36 source registry; resolving them is a scientific decision, not a parser change.
- Day/month order, identity-conflict resolution (Ground Medical only) and every save remain explicit human actions.

Tests: `tests/documents/p42-document-intelligence.test.ts` (actual PDF, real OCR output, synthetic alternative layouts).

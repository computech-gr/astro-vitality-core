# P34 original PDF table regression

The supplied original `original-cardio-five-column.pdf` contains a five-column table: Variable ID, Result, Unit, Observation (UTC), Source. Five rows cv-001 62 bpm, cv-005 118 mmHg, cv-006 76 mmHg, cv-027 48 ms, cv-065 98 %. The P32 comparison has simplified ID/value/unit lines. These are **actual user-provided PDFs**, not synthetic reconstructions.

Patch recognizes `Variable ID` and `Observation (UTC)` as headers and permits catalog-anchored rows without a redundant analyte column. Exact catalog IDs and catalog units remain mandatory; date prefill only from a valid timezone-qualified ISO timestamp in the explicit date column. No auto-saving.

**Required Lovable work:** run browser PDF.js geometry extraction against BOTH bundled PDF bytes and confirm 5/5 original and 5/5 simplified rows. If geometry merges columns or splits headers, correct `pdf-geometry.ts` and/or header reconstruction in the same task. Also run Immune and Behavioral original-PDF regression using original bytes once available, not only reconstructed fixture text. Never silently infer missing values. Maintain audit and review. No migrations/publishing.

## Results (Lovable, 2026-10-28)
- PDF.js geometry on actual bytes: original five-column PDF → 5/5 rows (cv-001 62 bpm, cv-005 118 mmHg, cv-006 76 mmHg, cv-027 48 ms, cv-065 98 %), timestamp 2026-10-02T08:00:00Z from the explicit column, source "SYNTHETIC Demo Device (original-cardio-five-column.pdf)"; 0 held, 0 errors. No geometry changes were needed.
- P32 simple PDF → 5/5 rows, no date prefilled (the prose timestamp is never used); shared date requires explicit confirmation.
- Added an explicit `Source` column mapping; the reported value is kept verbatim with the file name appended for traceability.
- Browser upload (Chromium, synthetic in-memory adapters) passed for Immune, Cardiovascular, Behavioral, Bone and both P34 PDFs; no page errors.
- Limitations: original Immune/Behavioral PDFs were not supplied; authenticated encrypted-storage acceptance, offline-device OCR and exact-revision CI unverified.

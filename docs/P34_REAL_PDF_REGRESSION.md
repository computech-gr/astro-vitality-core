# P34 original PDF table regression

The supplied original `original-cardio-five-column.pdf` contains a five-column table: Variable ID, Result, Unit, Observation (UTC), Source. Five rows cv-001 62 bpm, cv-005 118 mmHg, cv-006 76 mmHg, cv-027 48 ms, cv-065 98 %. The P32 comparison has simplified ID/value/unit lines. These are **actual user-provided PDFs**, not synthetic reconstructions.

Patch recognizes `Variable ID` and `Observation (UTC)` as headers and permits catalog-anchored rows without a redundant analyte column. Exact catalog IDs and catalog units remain mandatory; date prefill only from a valid timezone-qualified ISO timestamp in the explicit date column. No auto-saving.

**Required Lovable work:** run browser PDF.js geometry extraction against BOTH bundled PDF bytes and confirm 5/5 original and 5/5 simplified rows. If geometry merges columns or splits headers, correct `pdf-geometry.ts` and/or header reconstruction in the same task. Also run Immune and Behavioral original-PDF regression using original bytes once available, not only reconstructed fixture text. Never silently infer missing values. Maintain audit and review. No migrations/publishing.

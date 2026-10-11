# P22.2 — Bone Health Import Intake

## Implemented
- CSV file selection, bounded parser (200 rows, 250k characters), exact case-insensitive handbook ID/name matching, strict numeric/date/source/unit checks.
- Per-row review and selection before encrypted append-only storage using the existing P22.1 persistence API; preserves mission/crew scope and real/synthetic origin.
- Invalid or ambiguous rows rejected, never guessed. No unit conversion, clinical status, thresholds, or automated interpretation.
- PDF and scanned-image files can be selected to inform the user about the current **unsupported extraction** state. No raw document bytes are stored or transmitted, and no results are auto-populated from them.

## Explicitly NOT implemented
- PDF text extraction, image OCR, document parsing, automatic mapping of nonstandard lab names, or validation of the document's authenticity.
- Real/synthetic identity verification; P22.1 currently uses editable mission and crew IDs.
- Batch atomicity: if storage fails partway through, already saved append-only records remain; UI warns against blind retry.

## Next phase (P22.3)
Add privacy-preserving, offline-capable PDF text extraction and scanned-document OCR, with source-page provenance, confidence/uncertainty, human review of every extracted value, and security assessment. Requires an audited OCR/PDF implementation and explicit dependency/resource approval. Do not imply that file selection itself constitutes OCR.

## CSV format
`variable,value,unit,observed_at,source,specimen,assay_method,notes`

`variable` must match an existing handbook ID (e.g. `bone-043`) or exact catalog name. Use ISO date/time. Unit is preserved verbatim. Every row requires manual confirmation.

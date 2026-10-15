# P36.2A — Local Mission Document Review Workbench

## Implemented in this patch

- `/mission/documents` is a **local-only experimental workbench** for synthetic examination documents. It does not persist, sync, or upload patient information.
- Reuses existing P22 local PDF/image text/OCR extraction (including its documented OCR resource caveat), and adds bounded CSV/TXT text input.
- Matches only lines in the exact `catalog name: numeric value unit` shape, against unique names and **exact original units** in the P36.1 159-marker registry. Unmatched/ambiguous items are never guessed. Reference-range-looking lines are skipped. No unit conversion or diagnostic interpretation.
- Human checkboxes are temporary preview selections only. Clearing the page discards the preview. No report generation.

## Explicitly NOT delivered yet — do not claim full P36.2 completion

- Authenticated mission/crew binding, access-controlled persistent observations, encrypted append-only provenance, source hash, deduplication, reviewer identity/audit trail, secure document retention, or cross-source reporting.
- Production medical-document intake, third-party OCR/AI, BLE connector, independent scientific approval, clinical activation.

## Required next implementation gate

Before storing any real document-derived measurement: implement and test mission-bound authorization and explicit subject confirmation, immutable provenance, safe idempotency, user-by-user review, source hash, access controls, and secure persistence. Do not bypass FV-01-13, P32/P34, or the blocked Final Security Gate. Keep all trials synthetic until authorized.

## Manual smoke checks

1. Open `/mission/documents` with a synthetic PDF or text file. Verify consent is required.
2. Try a reference range and an unsupported unit; neither should create a candidate.
3. Try a uniquely named catalog marker with the exact unit; it may become an **unchecked** preview candidate.
4. Clear local document and verify candidate state is emptied.
5. Confirm no network request containing file contents, no database migration, no new medical observation and no clinical report.

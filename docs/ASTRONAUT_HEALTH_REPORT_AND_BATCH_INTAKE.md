# Astronaut Health History Report & Multi-File Intake

Research-use-only, no clinical validation, diagnosis, medical recommendation or autonomous scientific approval.

## Report

`/mission/health-report` is authenticated and mission/crew membership scoped. It reads only encrypted local unified observations, separates real and synthetic data, excludes erroneous/unreviewed records, and produces deterministic English narrative statements with supporting observation IDs. Missing data is described explicitly. Printable HTML supports browser **Print → Save as PDF**, without sending medical data to a server. Export as text is available. No LLM, external API, inferred diagnoses or thresholds.

## Multi-file intake

`/mission/intake` accepts up to 20 PDF, CSV, JPG, PNG or TXT files per selection, maximum 15 MB each. Files are processed sequentially on-device, SHA-256 hashed, deduplicated within the batch, and given individual success/failure states. The global existing 200-row candidate cap applies. All extracted rows remain unchecked, with per-row reviewer confirmation and existing authorization and encrypted append-only storage unchanged. No cloud upload.

## Boundaries and remaining validation

- Source record is an observation envelope, not a full medical record or diagnosis. No claim of complete medical history.
- PDF export is browser Print/Save as PDF, not a custom PDF generator.
- Local store currently reads up to 1,000 events; pagination/large-history handling needs separate acceptance testing.
- Source extraction is conservative and will not parse arbitrary laboratory layouts.
- Scientific catalogs and independent approval gates remain unchanged.
- Exact-commit CI, signed-in browser behavior and production build must be verified after application.

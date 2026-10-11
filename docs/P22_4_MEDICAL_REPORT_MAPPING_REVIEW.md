# P22.4 — Offline Medical Report Mapping and Review

## Scope
- Keep selectable-text PDF extraction and existing browser `TextDetector` OCR as-is.
- Improve conservative result matching for exact catalog names and slash-separated names (e.g. CTX / β-CTX, P1NP / PINP).
- Require one unambiguous catalog ID, numeric value and explicit unit; reject comparison symbols and lines labeled as reference ranges.
- Allow an astronaut to correct locally extracted text and rerun suggestions without uploading or persisting the original document.
- Every suggestion starts unchecked. Existing encrypted append-only save flow remains unchanged.

## Limits / safety
This does **not** add a portable OCR engine. Image and scanned-PDF recognition still requires browser `TextDetector`; unsupported browsers fail closed. A dedicated offline OCR engine and model assets, if approved, remain a separate follow-up. This parser does not recognize every laboratory layout or synonym and does not assess bone health, reference intervals or medical risk. A successful verifier checks code invariants, not diagnostic validity. Use synthetic examples for demos; obtain explicit authorization before testing real patient reports.

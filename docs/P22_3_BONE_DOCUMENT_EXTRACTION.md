# P22.3 — Local PDF / image extraction (experimental)

- PDF.js reads selectable-text PDFs locally; its worker is bundled via Vite `?url`.
- Scanned PDF pages and PNG/JPEG/WebP use the browser's native `TextDetector` **only where available**. Most browsers do not support it; unsupported cases fail closed, without claiming OCR success.
- No remote OCR service, no medical document upload, no original report persistence. No OCR language packs or server processing.
- Conservative matching: only catalog labels at the start of a line, followed by a number and explicit unit. Other report layouts may produce zero candidates. Users can still use manual entry or CSV.
- All extracted suggestions start **unchecked**, require a manually entered exam date, and must be confirmed against the original document. The app does not infer reference ranges, normality or clinical meaning.
- Imported confirmed results use the existing `saveBoneEntry` encrypted append-only path, scoped by mission and crew; no changes to scientific freeze or medical activation.
- Known limitations: browser-native OCR availability, Greek text recognition quality, selectable PDFs whose text has no line boundaries, page-order/layout issues, no automatic reconciliation of duplicated results. This is not a complete offline cross-browser OCR solution.
- Dependency: `pdfjs-dist`; lockfile should be updated by Lovable's package manager. No migrations.
- Verification: `bun run verify:p22:bone-documents`; targeted typecheck required after dependency resolution.

# P22.5 — Cross-browser on-device OCR fallback

The Bone Health document reader first tries native browser `TextDetector` and then falls back to `tesseract.js` (English recognition) in the browser. PDF rasterization continues to use PDF.js. No medical document is sent to an OCR API; results are suggested only and remain unchecked until a human confirms them. Original documents are not stored.

**Important offline limitation:** The default Tesseract worker, WASM engine and English trained-data may be fetched from a public asset host on first use. Network access may be necessary. Browser caching is not a guaranteed offline deployment strategy. Do not market this as fully offline until these assets are packaged and tested with network disabled. Resource hosts may receive ordinary asset-request metadata, but not the medical report.

**Verification:** Run `bun install` to resolve `tesseract.js` and update `bun.lock`; run `bun run verify:p22:ocr-fallback`, `bun run verify:p22:bone-documents`, targeted `bun run typecheck`. Verify scanned PDF and photo recognition in Chrome, Firefox and Safari using synthetic reports; compare every numeric value and unit. Static verifier does not prove OCR accuracy.

**Safety:** 12 MB / 12-page PDF limits and 20 MP image limit remain. No automatic medical interpretation or clinical activation. English-only UI. The next phase should vendor OCR assets and establish a deterministic offline readiness check, plus accuracy fixtures.

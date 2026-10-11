# P22.6 — Offline OCR asset readiness (not yet certified offline)

The browser `TextDetector` remains first choice. Tesseract.js fallback now prefers a **complete same-origin pack** at `/ocr/v1/`; otherwise P22.5's existing network-dependent fallback remains available. No reports are sent to an OCR server.

## Staging procedure

1. Install project dependencies normally in Lovable. `tesseract.js` and `tesseract.js-core` must be available in `node_modules`.
2. Obtain the compatible **English** `eng.traineddata.gz` from an approved, licensed source; review provenance and checksum. Place it at `assets/ocr/eng.traineddata.gz`. This patch does **not** bundle or download a language model.
3. Run `node scripts/stage-p22-ocr-assets.mjs`. It refuses to stage incomplete packs and prints SHA-256 hashes.
4. Deploy `public/ocr/v1/` on the **same origin** as the app. Confirm that each of six assets responds with binary/JS content, not an SPA HTML fallback.
5. While online, send `{type:'MITO_CACHE_OCR_V1'}` to the active service worker controller to populate its existing cache. The patch does **not** automatically send this message; an operational readiness procedure must do so. Check the UI's **Check offline OCR readiness** status afterward.
6. Validate airplane-mode extraction of a synthetic scanned PDF and image on the actual mission browser/device. Also verify cold-start, cache eviction, browser storage limits, version updates, worker CSP, and rollback.

## Limitations

- **Not fully offline by default.** A complete pack must be staged, deployed and cached, then independently tested with the network disabled.
- The cache status indicates resource presence, **not** that OCR works in airplane mode.
- The P22.5 online fallback remains enabled when the local pack is absent; the UI warns that connectivity may be needed.
- No clinical interpretation, no automatic result saving, and no scientific approval are introduced.
- OCR accuracy requires separate tests on representative synthetic reports. English-only user interface.

# P22.8 — Offline OCR activation and device validation

This stage adds a **read-only pack integrity report**, not a fabricated readiness approval.

1. Obtain `eng.traineddata.gz` from an independently reviewed upstream source. Record the exact HTTPS URL, repository revision, license, reviewer, review date, and SHA-256 in `assets/ocr/eng.provenance.json`. Never auto-approve provenance.
2. Place the reviewed language file at `assets/ocr/eng.traineddata.gz`; run `node scripts/verify-p22-ocr-provenance.mjs`.
3. Run `node scripts/stage-p22-ocr-assets.mjs` only after provenance approval. It copies worker, WASM cores, and language into `public/ocr/v1/`.
4. Run `node scripts/verify-p22-ocr-pack.mjs` to confirm all six staged files exist and the language hash matches approved provenance.
5. Deploy the same-origin assets, open the Bone Health page while online, and use **Check offline OCR readiness** to warm the service-worker cache. Check readiness again.
6. **On a real device**, enable airplane mode (disable both Wi-Fi and mobile data), reload the installed app, import a synthetic scanned PDF and a synthetic JPEG with known English biomarker values, correct any OCR errors, and confirm no network request is needed. Verify that candidates remain unselected until explicitly confirmed and that encrypted history is still scoped to the active crew/mission.
7. Repeat after a fresh app installation, and record device, browser, app version, test fixtures, exact expected/extracted values, network state, and outcomes in a separate human-signed test record.

**Do not claim fully offline-ready** from this verifier alone. A PASS (NOT READY) is a valid governance result, not an operational acceptance. Do not process identifiable patient reports in test fixtures. No clinical interpretation or automated medical action is authorized.

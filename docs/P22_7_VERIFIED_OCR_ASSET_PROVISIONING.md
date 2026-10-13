# P22.7 — Verified OCR Asset Provisioning

The English OCR language model is **not bundled**. Offline OCR is **not ready** until the real `eng.traineddata.gz` is obtained, its upstream revision and licensing reviewed, and its SHA-256 recorded in `assets/ocr/eng.provenance.json`.

1. Obtain `eng.traineddata.gz` from an official Tesseract language-data repository or other independently reviewed upstream source. Confirm the exact version is compatible with Tesseract.js 6.
2. Record its exact HTTPS source URL, upstream repository, immutable revision, applicable license, reviewer and review date, and actual SHA-256. Set status to `approved` only after this review.
3. Place the file at `assets/ocr/eng.traineddata.gz`. Do not commit private medical reports or test patient data.
4. Run `node scripts/verify-p22-ocr-provenance.mjs`. A pending record passes the _governance_ check but explicitly reports **NOT READY**.
5. Run `node scripts/stage-p22-ocr-assets.mjs` only after approval. The staging command fails closed when the model is missing, unreviewed, or hash-mismatched.
6. Publish the same-origin assets, use the app's **Check offline OCR readiness**, then test an actual scanned PDF/photo in airplane mode on the target device after a clean app install and cache preparation.

Passing a structural verifier is not evidence of OCR accuracy, offline readiness, scientific approval, or clinical safety. The 63 bone variables remain research-only; human confirmation is required for extracted results.

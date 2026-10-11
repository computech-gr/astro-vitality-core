# P22.9 — OCR human provenance review handoff

The candidate `assets/ocr/candidate/eng.traineddata.gz` was present in the supplied P22.8 project ZIP. The P22.9 verifier checks its bytes against the existing recorded SHA-256; it does not attest upstream licensing or replace human review.

## Human approval checklist (English-only application)

1. Inspect `assets/ocr/eng.provenance.json` and verify the pinned official upstream repository, revision, source, recorded hashes, and Apache-2.0 license. Review the upstream license and attribution requirements yourself. Check whether the redistribution plan and acknowledgements satisfy those requirements.
2. If and only if satisfied, a real human reviewer edits `license_reviewed_by` to their identity, `reviewed_at` to the actual ISO-8601 review timestamp, and `status` to `approved`. Never insert fabricated approval details or auto-approve.
3. Move `assets/ocr/candidate/eng.traineddata.gz` to `assets/ocr/eng.traineddata.gz` without modifying the bytes.
4. Run `node scripts/verify-p22-ocr-provenance.mjs` and `node scripts/verify-p22-9-ocr-review-handoff.mjs` before `node scripts/stage-p22-ocr-assets.mjs`.
5. Run existing `verify:p22:ocr-pack` and `verify:p22:activation` after staging; deploy and test service-worker caching and airplane-mode OCR on an actual target device with synthetic medical fixtures, including a fresh-install scenario. Record test evidence and explicit human sign-off.

**Do not treat a PASS (PENDING HUMAN REVIEW) as offline OCR readiness.** No clinical rules are activated. Existing PDF/CSV/OCR extraction remains unchanged by this patch.

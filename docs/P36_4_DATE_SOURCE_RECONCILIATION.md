# P36.4 — Source PDF header timestamp reconciliation

Problem: P36.2/P36.3 tests used PDF.js raw text-item order to prove the header date exists, but the runtime extracted `review.text` through P33 geometry reconstruction. Those strings need not preserve the same header sequence. As a result `explicitSharedCollectionTimestamp(review.text)` can return null despite a valid date in the original PDF.

Change: Re-read only the original local selectable-text PDF items to independently recover the collection header when preparing AI review rows. No document is sent to the provider by this operation. Conflicting timestamps fail closed. AI is still used automatically for analyte extraction when needed; the local PDF remains the authoritative date source. Applies to all four modules through shared `processBoneFileWithAi`.

Acceptance: Reupload original Challenge 02, verify five AI suggestions with `2026-10-14T07:35:00Z`, unchecked, editable, not saved. The shared date entry UI must not be necessary. Confirm that date comes from the original PDF, not the current device clock. Test on desktop and mobile. If still missing, log sanitized diagnostics (raw timestamp found? geometry timestamp found? suggestion eligibility?) without logging medical text or patient identifiers. Do not claim success from unit tests alone.

# P36.3 — Automatic date propagation fix

## Root cause
P36.2 recognized the Challenge 02 collection timestamp, but required the AI provider to set `dateKind: collection` for each suggestion. The actual AI suggestions were returned with missing dates / unknown dateKind, so all five review rows remained blank.

## Change
The shared pipeline now derives the single labelled UTC collection timestamp from the original selectable PDF text, independently of AI `dateKind`. It proposes that timestamp for each matching, non-saved AI review row with no existing date, no conflicting AI timestamp, and no unresolved uncertainty beyond missing observation date. Rows remain unchecked and editable. No persistence or approval is performed. If metadata is absent/ambiguous, the date remains missing.

## Acceptance
Re-upload the original Challenge 02 PDF after applying patch (queued files may need re-selection). Expect five AI suggestions with editable `2026-10-14T07:35:00Z`, all unchecked, and explicit save still requiring verification. Verify all four health domains, existing deterministic import, conflicting-date and multi-specimen safety. No migrations, RLS changes, provider setting changes or publishing.

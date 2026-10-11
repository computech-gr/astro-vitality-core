# P22.3b — English-only Bone Health CSV UI

Removes Greek translations from the CSV guide heading and blank-template download label. The application is intended for an English-language NASA Space Apps presentation. Existing CSV headers, parser, template, sample data, import flow, PDF/OCR integration, encrypted persistence and scientific safeguards remain unchanged.

The existing `verify:p22:csv-guide` now additionally checks that the Bone Health CSV import component contains no Greek-script characters.

Run: `bun run verify:p22:csv-guide`.

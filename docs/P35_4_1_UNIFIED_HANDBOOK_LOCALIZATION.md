# P35.4.1 — Unified Scientific Handbook English Localization

English is now the default way the Bone Health and Cardiovascular Health handbooks are shown. The original Greek handbooks by Nikolas are kept unchanged for traceability.

## Architecture

- Greek source catalogs stay byte-identical (tests check their SHA-256):
  - `data/scientific/cardiovascular-handbook.catalog.v1.json` — `4e08ddac…988bb8`
  - `data/scientific/bone-health-handbook-v7.catalog.json` — `13cadc00…66b5b413`
- English layers are joined by stable ID:
  - `data/scientific/cardiovascular-handbook.en.v1.json` (`biology_en`, `context_en`, `linkage_en`; relationships `combination_en`, `interpretationAndLimits_en`)
  - `data/scientific/bone-health-handbook-v7.en.json` (`what_en`, `specimen_en`, `unit_en`, `increase_en`, `decrease_en`, `implementationNotes_en`)
- `src/domain/scientific-localization/handbooks.ts` merges the two layers. If an English field is missing or still contains Greek, it returns `null`, and the screen shows "Translation review required" instead.
- `src/components/scientific-handbook-reference.tsx` shows the panels in English. A checkbox can also show the original Greek (`lang="el"`). The project had no language switcher before, so none was added.
- IDs, names, groups, categories, units, evidence tiers and activation and review statuses are taken from the Greek source catalogs without change.

## Coverage

- Cardiovascular: 96 of 96 markers (7 groups) and 8 of 8 relationship examples.
- Bone Health: 63 of 63 variables (6 categories).

## Ambiguities flagged for independent scientific review

- cv-015: the source name reads "Blood volum"; it was kept as written.
- cv-094: the source name reads "8-OHd" (probably 8-OHdG); it was kept as written.
- cv-001, cv-008, cv-047: some word choices need review (sinus node rate, arterial elasticity, image quality).
- Relationship 6: "out of range" refers to limits the handbook does not define. No threshold is implied or built.
- bone-019: "up to an appropriate level". No target level is defined.
- bone-026: the direction depends on the isotope model; the source forbids a simple up/down reading.
- bone-030: the decrease wording is ambiguous.
- bone-045: "increase or technical artifact" was translated literally.

## Status

The translation is machine-assisted and is waiting for independent scientific review. This is reference material only: no thresholds, diagnoses or alerts. Clinical activation: DISABLED. FV-01-13: OPEN. P32: PENDING. P34: PENDING. Final Security Gate: BLOCKED.

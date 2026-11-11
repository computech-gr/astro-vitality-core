# P61.4 reconstructed two-day synthetic fixture (NOT the owner's original PDF)

The owner's original 12–13 November 2026 two-day Alex Morgan PDF was not supplied with P61.4, so this
fixture is reconstructed for automated tests and Preview acceptance only:

- 2026-11-12: the 38 rows of that date copied verbatim from `fixtures/synthetic/p61/Alex_Morgan_304_Observations.csv`
  (owner-supplied); the seven held values match the owner's P61.4 table.
- 2026-11-13: the seven held values are the owner's P61.4 table values (Chloride 98, Bicarbonate 22, Creatinine 1.24,
  Urea nitrogen (BUN) 27, Platelets 318, Sleep duration 4.7, HRV SDNN 25); the other 31 values repeat 2026-11-12
  because the original values were not supplied.

76 observations, 38 series, 2 dates. Synthetic test data only — not clinical, scientific or human acceptance.
The PDF uses the original document's layout (examination headings, Domain / Measurement / Result / Unit table).

## Owner original (`owner/`)

`owner/MITOCHONDRIA_Alex_Morgan_12-13_Nov_2026_SYNTHETIC.pdf` is the owner-supplied original two-day PDF, copied
byte-identical (SHA-256 `27d75069cbfb13f45e32772364bbf16dd9c8ee58f97d559b0da2e5c6f0c9d02a`, pinned by
`tests/domain/p614-owner-file-acceptance.test.ts`). Its 13 November values are the owner's own follow-up values and
supersede the reconstructed ones above for acceptance; the reconstructed fixture remains only as a regression test.

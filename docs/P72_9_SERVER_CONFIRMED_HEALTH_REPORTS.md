# P72.9 — Server-confirmed Health Intelligence reports (Preview only)

## Behaviour

- Opening or refreshing the Health report reads the complete authorized dataset for the selected mission, crew member and provenance through the existing caller-scoped read APIs: the v9.4 observation pull and the v9 review pull. Every page is read. Nothing is written to the device.
- One frozen snapshot feeds the screen, Download PDF, Previous-format PDF, Export text, Print and both appendix downloads. Each export reads its source again and is cancelled if the dataset fingerprint changed.
- A failed or incomplete server read (offline, network, refused, unreadable row, scope mismatch, non-advancing or over-long pagination) produces no report. The user can then explicitly choose a local offline report, which is labelled `LOCAL OFFLINE DATASET — NOT SERVER VERIFIED` and states the local count and date range. The source never switches automatically.
- Empty period: both the current and the Previous-format PDF state "No examinations recorded in this period"; no findings, charts, concerns or recommendations are printed.
- Provenance in every PDF and text export: mission ID, subject (crew) ID, period, examination count and dates, period fingerprint, complete-dataset fingerprint, data source, report engine, scientific rule sets and export time. No tokens, session IDs or keys.

## 23 versus 24 pages (1–7 November)

The same server dataset was rendered with and without the provenance section. Without it the report has 23 pages; with it, 24. The text differs only by the page-2 data-source line, the provenance section on page 24 and that page's running header and footer. The scientific content is identical (period fingerprint `29e7b662…e9c0`, 143 observations, 5 dates).

## Remaining differences between devices

Interpretation review events and approved reference criteria are still read on the exporting device. Their identity is printed under "Scientific rules applied". In the verification they differed between browsers, but the findings did not.

## Not changed

Examination records, medical reviews, approvals, catalogs, memberships, audit history and database schema are unchanged. No migration. Not published.

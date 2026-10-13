# P35 — NASA Space Apps Global Submission Handoff

## Scope

P35 adds a read-only submission readiness and JSON handoff to the existing `/mission/submission` page. It uses repository-controlled P20, P32 and P34 ledgers; it does **not** submit anything to NASA, alter records, approve scientific findings, execute device tests, or store private health data. No database migration.

## Controlled evidence

- `data/submission/p20-evidence.v1.json` — existing demo and critical evidence statuses. Some implementation evidence marked ready in P20 does **not** establish P34 physical end-to-end acceptance.
- `data/submission/p20-final-external-evidence.v1.json` — team video, rights, consent, official 2026 rules verification.
- `data/validation/p34-real-device-acceptance.v1.json` — 15 human physical-device scenarios; currently not executed.
- `data/validation/p32-independent-review-gates.v1.json` — 8 pending independent science review gates.
- `data/submission/submission-manifest.v1.json` — P20 controlled input hashes, not a full snapshot of every P35 file.

## Human completion workflow

1. Execute and document all 15 P34 cases on real devices, including authentication expiry, mission isolation, offline sync, conflict review, and privacy direct-read denial. Preserve privacy-safe evidence and reviewers' notes.
2. Have independent qualified reviewers assess the 8 P32 gates, including the still-limited P25 directional-baseline interpretation and unapproved immune/cardiovascular/behavioral science mappings. Do not substitute passing unit tests for review.
3. Create and publish an original challenge video, verify rights and required consent, and enter its URL in the controlled external evidence file after human verification.
4. Recheck current official challenge page and actual 2026 submission form, judging criteria, license/attribution and deadlines before submission. Do not assume rules from earlier years.
5. Verify P33/P30/P31/P32/P34 browser navigation, role denial, accessibility, noindex and external links. Re-run security and researcher direct-access RLS audits, full test suite, typecheck and production build.
6. Regenerate P20 manifest when its controlled inputs change; verify hashes and final submission gate. Human reviewers must explicitly resolve the acceptance and science ledgers; this patch intentionally cannot approve them.

## Limits

The Mitochondria is an independent, open-source challenge project, not endorsed by NASA and not clinically validated. Synthetic mission scenarios are demonstrators, not real astronaut outcomes. Public NASA references are not live NASA physiological data. Exported P35 JSON is a status snapshot, not a certificate. No fabricated video, reviewers, metrics or hardware evidence.

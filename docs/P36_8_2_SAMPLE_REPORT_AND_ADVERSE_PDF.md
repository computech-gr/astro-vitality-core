# P36.8.2 — PDF highlighting and evaluator sample

## Objective A — governed adverse annotations

- `src/domain/health-intelligence/adverse-annotations.ts` validates record-level
  annotations; it never classifies values. The supplied raw `adverseRecordIds`
  input was replaced by `adverseAssessment` (rules + annotations).
- Accepted only when: rule exists, status `APPROVED`, exact version, named
  approver + approval reference + date, record is an included report row, exact
  metric ID and exact unit text, applicable mission phase, and non-empty
  baseline, provenance and context references with accepted quality.
- Pending-review, excluded, missing, unknown, wrong-unit and wrong-metric cases
  are rejected and stay neutral.
- Accepted rows print a text marker beside the observation in the main
  Descriptive findings table and in Appendix A, then dark red as a secondary cue.
- No approved rule exists in this repository, so the app passes no assessment
  and every report states "Adverse-value assessment: Not assessed / scientific
  review pending".
- `DEMONSTRATION_ONLY` rules are accepted only for synthetic scopes with
  `allowDemonstration: true`. They are labelled "DEMONSTRATION ANNOTATION … not
  an approved medical decision".

## Objective B — public evaluator sample

- `/competition/pdf/sample`. Menu: About & Open Source > Competition Materials >
  Sample Astronaut Health Report (PDF), listed after the Technical Manual so the
  existing PPTX-below-presentation order is kept. Also added to the public page
  list and sitemap.
- The static illustration was replaced by output from the shared pipeline:
  `bun run scripts/generate-synthetic-sample-report.ts` (13 synthetic
  observations across four domains, 9 pages, fixed metadata). Two runs gave
  identical bytes (SHA-256 `406c6beb…bcc9`). The built static asset has the same
  hash.
- Red rows in the sample are demonstration annotations only.

## Validation (2026-11-06)

| Gate                                         | Result                                           |
| -------------------------------------------- | ------------------------------------------------ |
| Focused tests (adverse + report PDF + menus) | PASS (8 new adverse tests)                       |
| Full `bun test`                              | PASS 1,145 / 0 fail (185 files)                  |
| Typecheck                                    | PASS                                             |
| Lint                                         | PASS 0 errors / 12 existing warnings             |
| Format check                                 | PASS                                             |
| SEO verifier / security audit                | PASS / PASS                                      |
| Production build                             | PASS; sample in `dist/client/competition/assets` |
| HTTP asset                                   | 200, `application/pdf`, 79,984 bytes             |
| Viewer desktop + mobile, signed out          | 9 pages rendered, no page errors                 |
| Menu link desktop + mobile                   | `/competition/pdf/sample`                        |

## Limitations

- Full `bun run check` chain: NOT EXECUTED as a single command; its main gates
  were run individually above.
- Hosted GitHub CI: NOT EXECUTED.
- The sample uses instant timestamps only; it does not exercise date-only rows.
- No database writes, migrations, RLS/auth/permission changes or publishing.

# FV-01.4.1J — Temporary Diagnostic Release Evidence

This is an operational evidence template, not authorization to publish. The owner must separately approve publication in explicit words. The existing FV-01.4.1I runbook remains authoritative.

## Release boundary

- Target canonical origin: `https://mitochondria.edocinfo.com`.
- Candidate commit reported by Lovable: `0be3cebda9ddc2bc8f98dd1e9313c72898f4b8c1`. Verify the deployed artifact matches the approved candidate before release; if not, stop and request renewed approval.
- Only the already-reviewed FV-01.4.1H temporary read-only diagnostic may be published; no database migrations, RLS changes, role assignments, missions, invitations or data writes.
- No browser probe may be executed by Lovable or via privileged impersonation.
- Phase B: NOT APPROVED. FV-01-13: OPEN. Final FV-01 security approval: BLOCKED.

## Pre-publication record (fill with actual evidence)

| Field                                                             | Result                                  |
| ----------------------------------------------------------------- | --------------------------------------- |
| Explicit owner approval recorded                                  | NOT VERIFIED                            |
| Canonical origin checked                                          | NOT VERIFIED                            |
| Approved candidate commit matches build                           | NOT VERIFIED                            |
| Pre-release published revision recorded for rollback              | NOT VERIFIED                            |
| Tests, audit, typecheck, lint, format, build                      | Reported PASS; recheck if build changes |
| Public disclosure of test email addresses acknowledged            | NOT VERIFIED                            |
| Publication action completed                                      | NOT VERIFIED                            |
| Public page displays diagnostic only for eligible test identities | NOT VERIFIED                            |

## Owner execution

Follow `docs/FV01_4_PHASE_A_TEMPORARY_PUBLICATION_RUNBOOK.md` for two independent browser profiles, A3, the five read-only counts, STOP on any nonzero count, and A7. Treat R4 as non-probative when the events table is empty. Never publish private screenshots showing nonzero counts.

## Cleanup gate

After recording the owner-run results, remove the temporary diagnostic, its identity-page wiring, and diagnostic-only tests in a reviewed follow-up patch. Re-run full checks, republish the cleaned build and verify the panel is absent. Keep Phase B NOT APPROVED until separate authorization.

# P36.8D — FV01-TEST-B independent reviewer acceptance evidence checklist

Status: **READY_FOR_LIVE_ACCEPTANCE** (not ACCEPTED). Protocol: `docs/P36_8D_INDEPENDENT_ACCEPTANCE_GATE.md`.
Synthetic, research-only. Backup status: `OWNER_MANAGED_BACKUP_RISK_ACCEPTED` (waiver, not verified restore).

## Pre-acceptance evidence (recorded 2026-10-15, read-only)

| Item                                                  | Result                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Migration 0010 SHA-256                                | `7a233de3…07f1` matches approved SQL                                                           |
| Migration history                                     | 11 entries                                                                                     |
| Security-definer RPCs (list/get/decide)               | 3 present; anonymous execute denied                                                            |
| Browser table grants on `p36_*`                       | 0                                                                                              |
| Original batch `e985ff6e-810f-419a-89a8-2376e217cb9f` | `pending_review`, synthetic, no decision key                                                   |
| Original items                                        | 8, fingerprint md5 `411c6bb5836ec920e5a085fb23ed2e21`                                          |
| Decision events / decision audits                     | 0 / 0                                                                                          |
| Memberships (all) / FV01-TEST-B fingerprint           | 10 / md5 `05db5f927fe136ccf013f6f50d1fb8d8`                                                    |
| Mission events / health index                         | 77 / 77                                                                                        |
| GitHub main `4f28db73`                                | quality success, trivy success, Supabase Preview skipped                                       |
| Acceptance-gate tests                                 | 3/3 pass                                                                                       |
| `bun run check`                                       | 376 pass, 0 fail                                                                               |
| Disposable PostgreSQL 17.9                            | 305/305 (role isolation, research-only decisions, idempotency, immutability, revocation races) |
| Typecheck / lint / build                              | pass / 0 errors, 10 warnings / pass                                                            |

## Live acceptance — reviewer fills in (each step requires owner authorization)

- [ ] 1. CI green for commit to publish; baseline above re-queried with no drift
- [ ] 2. Owner approves publication; version + timestamp recorded
- [ ] 3. Signed-out `/mission/ground`: no queue, no controls, no data requests
- [ ] 4. Crew Self submits a NEW synthetic batch in FV01-TEST-B; batch ID + item count recorded
- [ ] 5. `marketing@computech.gr` (independent of submitter) views new batch; pre-decision values fingerprint
- [ ] 6. One authorized decision (`accepted_for_research` or `rejected_for_research`); receipt captured
- [ ] 7. Batch leaves queue; values byte-identical; exactly 1 event; audit row has no values/note/filename/excerpt
- [ ] 8. Idempotent retry via controlled same-key method only (UI does not replay after navigation)
- [ ] 9. Crew Self / Operator / Researcher / anonymous / other-mission denial (live read-only; revocation via disposable tests)
- [ ] 10. Original batch fingerprint, MISSION_TEST, mission events, health index unchanged; clinical disabled
- [ ] 11. Independent reviewer sign-off: name ______ date ______

## Remaining blockers

- Publication not authorized; no live decision authorized.
- No live authenticated reviewer evidence yet.
- Standing gates unchanged: FV-01.13 OPEN, P32/P34 PENDING, Final Security Gate BLOCKED, clinical DISABLED.

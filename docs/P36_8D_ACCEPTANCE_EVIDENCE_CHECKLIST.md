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
- [ ] 8. Idempotent retry via controlled same-key method only (UI does not replay after navigation). Status: **NOT_RUN** until a reviewed, separately approved harness exists — see "Step 8 controlled replay method"
- [ ] 9. Crew Self / Operator / Researcher / anonymous / other-mission denial (live read-only; revocation via disposable tests)
- [ ] 10. Original batch fingerprint, MISSION_TEST, mission events, health index unchanged; clinical disabled
- [ ] 11. Independent reviewer sign-off: name ______ date ______

## Replay & CI readiness re-verification (2026-10-15 20:57 UTC, read-only)

| Item                                   | Result                                                                                                                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration 0009 / 0010 SHA-256          | `516d2184…0f49` / `7a233de3…07f1` unchanged; history 11                                                                                                                                      |
| Original batch + items                 | `pending_review`, no decision key; 8 items, md5 `411c6bb5…2e21`; 0 events; 10 memberships                                                                                                    |
| Disposable PostgreSQL 17.9             | 305/305, incl. D2 same-key replay (identical receipt, `replay=true`), D3 same-key different payload refused, CC1 concurrent conflicting decisions, CC2 concurrent identical retries, RV1/RV2 |
| Replay-readiness contract tests        | 3/3 pass                                                                                                                                                                                     |
| `bun run check` / build                | 382 pass, 0 fail / pass                                                                                                                                                                      |
| GitHub HEAD at verification `52f26669` | quality success, trivy success, Supabase Preview skipped (contains closure-handoff files)                                                                                                    |
| Commit containing this replay patch    | CI NOT YET VERIFIED — record its SHA and results before step 1                                                                                                                               |

## Step 8 controlled replay method (design only; not implemented, not approved)

1. Owner gives separate explicit approval for the harness and for one live replay.
2. Harness is a local, reviewer-run script (never deployed, no route, no UI button) that signs in interactively as the independent reviewer and calls the existing `p368_decide_ground_medical_batch` RPC.
3. It is hard-bound to one new synthetic FV01-TEST-B batch ID supplied at start; it refuses any other batch, mission or decision value.
4. It generates the idempotency key in memory, sends the decision once, then resends the byte-identical payload and key within the same process. Key, token, credentials and note are never printed, logged, stored or written to disk.
5. Evidence recorded: both receipts identical (`decision_request_id`, `decided_at`), second has `replay=true`; exactly one decision event and one decision audit row for that batch.
6. Before execution, show in a disposable database that the harness refuses other batches and payload changes. Without this, step 8 stays `NOT_RUN`, never `PASS`.

## Remaining blockers

- Publication not authorized; no live decision authorized.
- No live authenticated reviewer evidence yet.
- Step 8 replay harness neither implemented nor approved.
- Standing gates unchanged: FV-01.13 OPEN, P32/P34 PENDING, Final Security Gate BLOCKED, clinical DISABLED.

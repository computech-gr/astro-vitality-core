# P62 — Observation Sync Repair and NASA Evaluator Demo Preparation

Status: code fix in Preview only. Nothing published, no migration, no Cloud write, no deletion, no local-storage reset.
Inventory read on 2026-11-14 (read-only). Mission `MITO_DEMO_2026` = `mission-9d8ce8f3e5554509a0885461f9ad2e1c`;
Alex Morgan = `crew-9806e7e611f44dc38dac5e23f7740f1a` (synthetic).

## 1. Root cause (both reported errors)

One cause, two messages. The server-function input schema in `src/lib/observation-sync.functions.ts` was a
strict Zod object that never listed `catalogBasis` (it was added to the envelope, the domain sync check and the
local store, but not to this input schema; `git log -S catalogBasis` on the file is empty, so the deployed
build has the same defect).

1. `Unrecognized key: "catalogBasis"` — strict schema refuses the key on every synthetic demo record (`demo:ubt-…`).
2. `Invalid observation envelope/date precision` — the follow-up refine ran on the parsed value **without** the
   refused key, so `validateUnifiedObservation` reported "demo metric and basis must appear together". The
   generic message wrongly pointed at dates; date precision was not at fault (reproduced: the same record passes
   `validateUnifiedObservation`).

Because input validation runs before the handler, the whole 50-event batch was refused, and the client counted
those events as Pending rather than Failed. Non-demo events (13) synced earlier.

Not the cause: database functions (they store ciphertext only and were not reached), encryption, serialization,
schema version (v1/v2 both accepted), the server demo snapshot check.

## 2. Changes (Preview)

| File                                                        | Change                                                                                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/observation-sync.schema.ts` (new)                  | Strict input schemas moved here; adds exact-key `catalogBasis` (literal kind/classification, ID patterns, version ≥ 1); refine now reports the specific envelope reason. |
| `src/lib/observation-sync.functions.ts`                     | Imports the schemas; handler logic unchanged.                                                                                                                            |
| `src/domain/health-intelligence/observation-sync.ts`        | Exports `OBSERVATION_SYNC_ALLOWED_FIELDS` (same list); used by a parity test.                                                                                            |
| `src/domain/health-intelligence/observation-sync-runner.ts` | A thrown upload still throws with the same message, now as `ObservationSyncUploadError` naming the refused batch.                                                        |
| `src/components/stored-observations-review.tsx`             | Uses those IDs so refused events count as Failed (retryable), not Pending.                                                                                               |
| `tests/domain/p62-observation-sync-compat.test.ts` (new)    | 10 regression tests (below).                                                                                                                                             |

Unchanged: validation strength (strict keys, full envelope rules, server demo-snapshot recheck, scope/role checks),
encryption, append-only local store, idempotent event IDs, database SQL.

## 3. Required database migrations

None for the sync fix. Production needs only a code publication (owner authorization required).

## 4. Test results

- New: 10/10 (demo record accepted and byte-identical; schema = envelope fields; malformed/misplaced bases refused;
  missing basis gives the specific reason; unknown keys refused; date-only kept as calendar date; zoned instant kept;
  six invalid precision cases refused; encrypt → store → decrypt round trip with idempotent replay; refused batch
  counted Failed then retried to Synced).
- Full suite 1,846/1,846 (after regenerating the ignored release sample, as CI does). Typecheck, lint (0 errors,
  12 existing warnings), format check, security audit and production build pass.
- Not run: disposable PostgreSQL integration (no `FV01_PG_SOCKET_DIR`; SQL unchanged); live sync (would write to
  Cloud); browser check.

## 5. Demo data inventory (MITO_DEMO_2026 only)

### Cloud (read-only counts)

| Record                                        | Count     | Notes                                                                                                   |
| --------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| Encrypted observation sync events             | 13        | all entry events, 13 distinct observations, Alex Morgan, synthetic, 1 uploader, 2026-11-01 → 11-06      |
| Review attestation events                     | 174       | 174 distinct records, 80 on demo metrics, 8 batches, 2026-11-01 → 11-12                                 |
| — attested records also present in cloud sync | 13        | **161 attested records exist in the cloud only as attestations; their observations are device-only**    |
| Review correction events                      | 0         |                                                                                                         |
| Legacy plaintext mission events               | 84        | 62 unified-intake (pre-guard, last 2026-11-01), 22 manual domain entries                                |
| Crew health record index                      | 84        | mirrors the mission events                                                                              |
| Audit events                                  | 139       | 84 ingest, 29 workspace reads, 5 invites created, 4 review-sync and 2 observation-sync appends, others  |
| Submitted term batches / terms                | 4 / 235   | all synthetic, Ground Medical, 2026-11-07 and 11-12                                                     |
| Triage events                                 | 235       | all ACCEPT_FOR_REVIEW                                                                                   |
| Demo scope rows                               | 212       | 197 owner-authorized + 15 Researcher grants (P61.5)                                                     |
| Demo decisions / activations                  | 206 / 206 | 206 distinct demo IDs, 0 decisions without activation                                                   |
| Scope terms without a decision                | 6         |                                                                                                         |
| Triaged terms not in scope                    | 23        |                                                                                                         |
| Alias events                                  | 0         |                                                                                                         |
| Legacy P36 review batch                       | 1         | accepted_for_research, synthetic                                                                        |
| Production catalog events / source receipts   | 0 / 0     | demo activation is not scientific approval                                                              |
| Active memberships                            | 4         | 1 crew_self, 1 ground_medical (mission-wide), 2 mission_operator; Researcher acts through global grants |

The 206 active demo biomarkers are confirmed.

### On the Ground Medical device (from the screen; I cannot read device storage)

Pending 192 · Synced 13 · Reviews synced 174. The device also holds held/unrecognized rows, local review requests
and decisions, sync receipts and run history in encrypted IndexedDB. An exact per-category device count needs an
in-app read-only export on that device. The 192 are **not disposable**: they are the only copy of observations behind
161 cloud attestations.

## 6. Evaluator cleanup design (non-destructive; nothing executed)

Recommended: **dedicated evaluator crew record in the same mission**, e.g. "Alex Morgan — Evaluator Demo".

- Every intake, history, sync, report and attestation view is scoped by crew member, so the evaluator view starts
  empty and the old history is untouched and still reachable.
- Mission-level demo scope and all 206 activations apply automatically (they are per mission, not per crew).
- Created through the existing Mission Operations screen by a mission operator. No migration, no code. Reversible by
  deactivating the assignment. Old records can never reappear in the new crew's views after sync: scope keys,
  encryption keys and event IDs are per crew.
- Needs: owner approval for one Cloud write; Ground Medical's mission-wide membership already covers the new crew; a
  Crew Self account is optional.

Alternative (code, no DB): an evaluator date-window filter on default views. Weaker: depends on device-local state and
dates, so it is easier to break.

Not recommended: deletion. Sync, attestation, triage, demo and audit tables are append-only with mutation-rejecting
triggers; deletion would need a migration that disables them, would orphan 174 attestations and would destroy audit
history. If it is ever required, it needs a record-level list, a verified export and a separate written approval.

### Backup and rollback

1. Before anything else, after publication: run one explicit **Sync observations & reviews** on the Ground Medical
   device so the 192 local observations get encrypted cloud copies (owner-authorized Cloud write). Expect Pending 0;
   any Failed or Conflict entry is listed by ID.
2. CSV export of cloud metadata for this mission (counts above) to the owner's private storage.
3. Rollback for the recommended path = deactivate the evaluator crew assignment. No existing record changes.

## 7. Evaluator walkthrough (Alex Morgan evaluator record, synthetic)

| Step                         | Role / account                      | Page                                       | Action                                                                                       |
| ---------------------------- | ----------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Import                       | Ground Medical                      | `/mission/intake`                          | Select mission + evaluator crew, synthetic; upload the PDF/CSV                               |
| Recognition                  | automatic                           | `/mission/intake`                          | Rows match the signed demo snapshot (exact label + unit)                                     |
| Ground Medical review        | Ground Medical                      | `/mission/intake`                          | Confirm eligible rows, save; optional **Save approval** (attestation) in stored observations |
| Unknown biomarker submission | Ground Medical                      | `/mission/intake#unknown-biomarker-review` | **Record reviewer decision**, submit terms                                                   |
| Triage                       | Researcher                          | `/mission/scientific-review`               | Accept for review                                                                            |
| Synthetic demo authorization | Researcher                          | `/mission/scientific-review`               | Add terms to the demo scope (must come **before** the decision)                              |
| Researcher decision          | Researcher                          | `/mission/scientific-review`               | **Record Bulk SYNTHETIC DEMO Decisions**                                                     |
| Ground Medical activation    | Ground Medical (not the Researcher) | `/mission/ground`                          | Activate the decided entries                                                                 |
| Re-import                    | Ground Medical                      | `/mission/intake`                          | Held rows now recognized; confirm and save                                                   |
| Sync                         | Ground Medical                      | `/mission/intake`                          | **Sync observations & reviews**                                                              |
| Health report                | Ground Medical                      | `/mission/health-report`                   | **Download PDF**                                                                             |

Order correction: the database requires the term to be in the demo scope before a Researcher demo decision, so
"Synthetic Demo Authorization" comes before "Researcher Decision".

## 8. Remaining risks

- Production still has the defect until publication.
- Device pre-check: demo records are sent only if the device holds a current verified demo snapshot; otherwise they
  show as "not sent (failed validation)" (fail-closed, retryable once refreshed online).
- 62 legacy plaintext unified-intake mission events predate the guard; they stay as historical rows.
- Device-local counts are not independently verified.
- Synthetic demo activation is never scientific approval.

## 9. Recommended sequence (each step needs its own approval)

1. Review this fix in Preview.
2. Authorize publication.
3. Run one sync on the Ground Medical device; confirm Pending 0 / Failed 0 and report any conflicts.
4. Export the metadata backup.
5. Approve creation of the evaluator crew record.
6. Rehearse the walkthrough with a new synthetic examination.

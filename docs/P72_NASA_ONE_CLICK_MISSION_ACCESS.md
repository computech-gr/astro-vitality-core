# P72 — NASA one-click mission access and Alex Morgan examination copy

Status: implemented in Preview; **no copy executed, nothing published**.

## Role → account → console

| Button     | Mapped account (server-only) | Console                    | Needed membership in target mission                 | Current state                             |
| ---------- | ---------------------------- | -------------------------- | --------------------------------------------------- | ----------------------------------------- |
| Astronaut  | theosilv@gmail.com           | /mission/experience        | crew_self for crew-43f5fe4d102f40d19ced676dabd3b672 | active                                    |
| Researcher | nikolasilvestros@gmail.com   | /mission/scientific-review | researcher                                          | **missing**                               |
| Medical    | marketing@computech.gr       | /mission/ground            | ground_medical                                      | **missing** (sales@computech.gr holds it) |

Target mission: `mission-3fd366c331ed46afb0645cced1d45294` (MISSION_TEST, "Mitochondria validation mission"), crew `crew-43f5fe4d102f40d19ced676dabd3b672` ("Astronaut Test 01", ASTRO-TEST-001).

Behaviour: signed-out or demo visitors keep the one-click synthetic demo (P69, unchanged). A signed-in mapped account goes straight to its console with the target membership preselected. Any other signed-in account is told which (masked) account the role expects and can switch via Standard Sign-in (`/mission/identity?role=…`), which continues to the console after a successful sign-in. No real session, password or token is ever issued to another visitor.

## Source inventory (MITO_DEMO_2026, Alex Morgan, uploaded by marketing@computech.gr)

Source scope: `mission-9d8ce8f3e5554509a0885461f9ad2e1c` / `crew-9806e7e611f44dc38dac5e23f7740f1a` / synthetic. 265 encrypted entries (0 status events), all synthetic, all intake-accepted; 264 Ground Medical attestations exist in the source (never copied). 84 older plaintext mission events also exist (not part of the current examination store; not copied).

| #   | Examination source document                                                 | SHA-256           | Observation date(s)    | Domains                                  | Records | Copy | Held |
| --- | --------------------------------------------------------------------------- | ----------------- | ---------------------- | ---------------------------------------- | ------- | ---- | ---- |
| 1   | MITOCHONDRIA_Alex_Morgan_SYNTHETIC_Cardio_Behavioral_Followup_Oct2026.csv   | 47fa43b38675a292… | 2026-10-20, 2026-10-30 | cardiovascular                           | 10      | 10   | 0    |
| 2   | MITOCHONDRIA_Alex_Morgan_Synthetic_Examinations_2026-11-01_IMPORT_READY.pdf | 6c51a49ce92568b6… | 2026-11-01             | behavioral, bone, cardiovascular, immune | 30      | 12   | 18   |
| 3   | MITOCHONDRIA_Alex_Morgan_Synthetic_Examinations_2026-11-02_IMPORT_READY.pdf | 6207d78c722a38bc… | 2026-11-02             | behavioral, bone, cardiovascular, immune | 30      | 12   | 18   |
| 4   | NASA_Astronaut_Simulated_Medical_Report.pdf                                 | 59805b82bce32087… | 2026-11-05, 2026-11-06 | cardiovascular                           | 3       | 3    | 0    |
| 5   | Alex_Morgan_Complete_Examination_2026-11-07.pdf                             | d1bd6d9fa7efe521… | 2026-11-07             | behavioral, bone, cardiovascular, immune | 80      | 52   | 28   |
| 6   | Manual entry                                                                | —                 | 2026-11-07             | immune                                   | 1       | 0    | 1    |
| 7   | MITOCHONDRIA_Alex_Morgan_2026-11-08_Import_Ready.pdf                        | cb585a5df48e3d2d… | 2026-11-08             | bone, cardiovascular, immune             | 14      | 6    | 8    |
| 8   | MITOCHONDRIA_Alex_Morgan_12-13_Nov_2026_SYNTHETIC.pdf                       | 27d75069cbfb13f4… | 2026-11-12, 2026-11-13 | behavioral, bone, cardiovascular, immune | 62      | 24   | 38   |
| 9   | Alex_Morgan_20_Biomarkers_2026-11-14.pdf                                    | a64817e0700d8e75… | 2026-11-14             | bone, cardiovascular                     | 5       | 0    | 5    |
| 10  | MITOCHONDRIA_P63_Alex_Morgan_SYNTHETIC_Examination_2026-11-15.pdf           | 7e25d719792f2f8e… | 2026-11-15             | behavioral, bone, cardiovascular, immune | 30      | 0    | 30   |

## Dry-run (digest `f7536aaf6648aec57176bb21ae58c2699322e6044deaf8e04524604a7896ad26`)

265 source records → **119 copy**, 0 already copied, **146 held**. All 146 held records use MITO_DEMO_2026 synthetic demo-catalog terms, which are bound to that mission; copying them would need a separate owner-approved demo-catalog authorization for the target mission. Existing destination copies: 0.

Copy rules (src/domain/examination-copy/p72-copy-plan.ts): values, units, dates, precision, document name/SHA-256/excerpt preserved; deterministic new ID per source record + target scope; label names the source record; reviewState `pending_review` and reviewer confirmation cleared (the target mission's own reviewers must confirm); attestations, corrections and approvals are never copied; source rows untouched.

## Execution after approval (not run)

1. Read-only export of the source rows and the target scope's event IDs.
2. `bun scripts/p72-examination-copy.ts seal --rows <src.json> --existing <target-ids.json> --out <dir> --actor <approving account uuid> --approval <ref>` → 6 single-statement batches (ON CONFLICT DO NOTHING + one audit_events row per batch with the source→copy pairs).
3. Apply each batch once; re-running inserts nothing.
4. Post-check: 119 target entries, source still 265 with unchanged fingerprints.

Rollback (append-only): `withdraw` mode writes "erroneous" status events for every copy; nothing is deleted.

## Remaining blockers

- Researcher and Medical mapped accounts have no membership in the target mission (invite via Mission & Crew Operations, owner decision).
- Copies are pending review and reports show only accepted records. P72.1 found that no in-app step can confirm an already-stored pending record, so copies would never reach the Full Health Report; see docs/P72_1_MISSION_READINESS.md for the supported path.
- 146 demo-catalog records need a separate demo-catalog authorization for the target mission.
- Copy execution and publication need explicit approval.

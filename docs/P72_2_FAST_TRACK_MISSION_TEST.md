# P72.2 — MISSION_TEST fast-track: normal Examinations import → Full Health Report

Status: Preview only. No publication, copy, membership, catalog or data change was made. Target: MISSION_TEST /
Astronaut Test 01 (`mission-3fd366c331ed46afb0645cced1d45294` / `crew-43f5fe4d102f40d19ced676dabd3b672`).

## A. Blocking defect and minimal fix

Ground Medical invitations cannot carry a crew binding (database rule), so every invited Ground Medical membership
(sales@ today, marketing@ after acceptance) is mission-wide. The database already authorizes mission-wide Ground Medical
(observation sync and the caller-scoped crew roster RPC accept `crew_member_id is null`), but Examinations, Stored
observations/Cloud sync and the Full Health Report listed only crew-bound memberships — so Medical could never select
Astronaut Test 01. Fix: the identity loader adds, for mission-wide Ground Medical only, the crew returned by
`p36_dynamic_crew_roster_v1` for that same mission (`src/domain/mission-access/mission-level-ground-medical.ts`).
Originals are kept; Researcher/operator are never expanded; an unreadable roster adds nothing; the server re-validates
every scope. Tests: `tests/mission/p722-mission-level-ground-medical.test.ts`.

## B. Account steps (normal UI only)

1. info@computech.gr → Mission & Crew Operations → MISSION_TEST → create invite **Researcher** → send the code to
   nikolasilvestros@gmail.com, who signs in and accepts it (no approval stage).
2. info@ → create invite **Ground Medical** → bind recipient `marketing@computech.gr` → **sales@computech.gr** signs in
   and approves it (info@ and marketing@ cannot approve) → marketing@ signs in and accepts. Invites expire after 24 h
   by default; create them when the three people are available. sales@ stays unchanged.
3. theosilv@gmail.com (Astronaut) → Examinations → mission "MISSION_TEST — Astronaut Test 01", provenance Synthetic →
   import the documents in section C, confirm rows, save → **Cloud sync** (Stored observations).
4. marketing@ → Examinations → select "MISSION_TEST — Astronaut Test 01" → **Cloud sync** (downloads the Astronaut's
   records to this device) → Full Health Report.

## C. Source documents (originals, byte-identical; SHA-256 prefixes)

| Order | Document                                                                    | SHA-256                | Eligible | Review action                                                                                                                                                                            |
| ----- | --------------------------------------------------------------------------- | ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Alex_Morgan_Complete_Examination_2026-11-07.pdf                             | d1bd6d9f… (in repo)    | 52       | Click **Apply 2026-11-07T09:30:00Z — day/month/year, UTC as stated**; untick duplicate rows 184, 190, 196 (Immune hsCRP/IL-6/TNF-α); keep row 313 and tick the duplicate acknowledgement |
| 2     | MITOCHONDRIA_Alex_Morgan_12-13_Nov_2026_SYNTHETIC.pdf                       | 27d75069… (in repo)    | 24       | Dates come from the document (12 + 12)                                                                                                                                                   |
| 3     | NASA_Astronaut_Simulated_Medical_Report.pdf                                 | 59805b82… (in repo)    | 3        | Type the printed date per row: HRV RMSSD 24 ms 2026-11-06, Triglycerides 165 mg/dL 2026-11-06, IL-6 5.8 pg/mL 2026-11-05 (date only)                                                     |
| 4     | MITOCHONDRIA_Alex_Morgan_Synthetic_Examinations_2026-11-01_IMPORT_READY.pdf | 6c51a49c… (owner copy) | 12       | Date 2026-11-01                                                                                                                                                                          |
| 5     | MITOCHONDRIA_Alex_Morgan_Synthetic_Examinations_2026-11-02_IMPORT_READY.pdf | 6207d78c… (owner copy) | 12       | Date 2026-11-02                                                                                                                                                                          |
| 6     | MITOCHONDRIA_Alex_Morgan_2026-11-08_Import_Ready.pdf                        | cb585a5d… (owner copy) | 6        | Date 2026-11-08                                                                                                                                                                          |
| 7     | MITOCHONDRIA_Alex_Morgan_SYNTHETIC_Cardio_Behavioral_Followup_Oct2026.csv   | 47fa43b3… (owner copy) | 10       | Instants 2026-10-20 / 2026-10-30 08:00 UTC                                                                                                                                               |

Documents 1–3 were replayed through the real pipeline (`tests/domain/p722-mission-test-examination-import.test.ts`).
Documents 4–7 are not in the repository; their expected rows are in `P72.2_expected_119_observations.csv` but their
parsing was not replayed. Do not import `Alex_Morgan_20_Biomarkers_2026-11-14.pdf` or the P63 examination (all rows use
demo biomarkers). Every other row in these documents stays held (demo biomarkers have no MISSION_TEST approval);
25(OH) Vitamin D, P1NP and CTX are never eligible.

## D. Expected counts

Confirmed and saved: 79 from documents 1–3, 119 in total. Full Health Report: 78 / 118 reported (row 313 repeats
RMSSD 12 ms at the same instant and is reported once). All Cardiovascular. Held: everything else.

## E. Report / PDF validation

Astronaut and Medical, each on their own device after Cloud sync: Examinations shows the stored rows; Health Domains →
Cardiovascular lists them; Full Health Report → mission "MISSION_TEST — Astronaut Test 01" → header shows Astronaut
Test 01 / MISSION_TEST, synthetic label, observation count above, no demo biomarker, no Vitamin D/P1NP/CTX → download
PDF and check the same. Researcher has no Full Health Report access by design (crew_self/Ground Medical only).
Replay fixture PDF from documents 1–3 (same `createPremiumReportPdf`, same fonts): 14 pages, every page inspected.

# P72.1 — MISSION_TEST readiness: access, biomarker eligibility, transfer and reporting

Status: read-only investigation plus one synthetic-fixture test. **No membership, catalog, copy, approval, publication or push was made.**
Target: MISSION_TEST (`mission-3fd366c331ed46afb0645cced1d45294`, active), crew Astronaut Test 01 (`crew-43f5fe4d102f40d19ced676dabd3b672`, active).

## A. Membership changes required (through Mission & Crew Operations, by the MISSION_TEST operator)

| Account                                 | Current MISSION_TEST state                                                                | Change               | Steps                                                                                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| theosilv@gmail.com (Astronaut)          | active `crew_self` for Astronaut Test 01                                                  | none                 | —                                                                                                                                                                                             |
| nikolasilvestros@gmail.com (Researcher) | none (has `researcher` in FV01-TEST-B; global scientific approver/reviewer/triage grants) | add `researcher`     | info@computech.gr creates a Researcher invite → Researcher accepts while signed in. No approval stage.                                                                                        |
| marketing@computech.gr (Medical)        | none (has `ground_medical` in MITO_DEMO_2026 and FV01-TEST-B)                             | add `ground_medical` | info@computech.gr creates a Ground Medical invite → binds it to marketing@computech.gr → **sales@computech.gr approves** (the inviter and the recipient cannot approve) → marketing@ accepts. |

Current MISSION_TEST members: info@computech.gr `mission_operator`, theosilv@gmail.com `crew_self`, sales@computech.gr `ground_medical`. No open invites.

## B. Medical role conflict

None. Memberships are unique per mission + account + role, so two Ground Medical accounts can coexist; sales@ is not removed or altered. Role-combination rules (crew_self × ground_medical/researcher, ground_medical × mission_operator) are not triggered for any of the three accounts. Only blocker: sales@ (last sign-in 2026-10-11) or another MISSION_TEST operator/Ground Medical member must perform the independent approval.

## C. The 146 held records

All 146 fail for one reason: their identity is a MITO_DEMO_2026 synthetic demo-catalog entry (`demo:ubt-*`), and MISSION_TEST has no demo catalog (0 demo decisions/activations, 0 scientific-sharing policy, 0 global catalog events). 60 distinct definitions; every one was Researcher-decided and Ground-Medical-activated in MITO_DEMO_2026 only, under the P37/P38/P61.4/P61.5 scope authorizations. None carries a reference interval, threshold, specimen or method; all are `SYNTHETIC_DEMO_NOT_SCIENTIFICALLY_VALIDATED`. Against the built-in catalog: 21 match a handbook label but that entry has no matching exact unit (unit review required); 39 have no built-in match. Full list: `/mnt/documents/p72.1/P72.1_held_biomarker_definitions.csv`.

## D. Proposed catalog changes (no SQL; existing in-app workflow inside MISSION_TEST)

The definitions cannot be reused directly: entries, scope and activation are bound to their mission by the database and by sync validation. Term IDs depend only on label + exact unit, so re-approving the same 60 inside MISSION_TEST makes the copies' catalog basis match. Sequence: MISSION_TEST Ground Medical imports the source synthetic documents for review → Unknown Biomarker Review → submit metadata (labels/units/hashes only) → Researcher: accept for review, authorize demo scope, synthetic demo decision (same name/domain/unit) → a different Ground Medical account activates. Open owner decisions: `ubt-7b25ce69` (25-Hydroxyvitamin D) is under the rule "never processed again"; P1NP and CTX need identity review against the handbook entries.

## E. Transfer dry-run

Baseline re-run (read-only export, 265 sources, 0 target rows): digest `f7536aaf…896ad26` unchanged → 119 copy / 146 held. Hypothetical after D: **265 copy / 0 held** (`/mnt/documents/p72.1/P72.1_projected_transfer_dry_run.json`). Source rows, provenance and synthetic classification unchanged; 264 attestations never copied.

**Finding:** copies start `pending_review`, and no in-app step confirms an already-stored pending record (confirmation happens only at Examinations intake before saving). Copies would therefore never appear in the Full Health Report. Recommended path: do not run the copy; the Astronaut imports the original synthetic documents through Examinations in MISSION_TEST and confirms each row (normal Astronaut submission), which preserves document name/SHA-256 provenance.

## F. Report/PDF evidence (isolated synthetic fixtures)

- `tests/domain/p721-mission-test-report.test.ts`: copies are excluded as pending review; in-memory confirmed fixture renders a PDF for Astronaut Test 01 / MISSION_TEST without the reviewer's name.
- Browser download (Preview, real `createPremiumReportPdf` + `downloadReportBlob`): 119 eligible copy values with simulated confirmation → 118 reported (1 duplicate counted once), 16-page searchable PDF, 181,385 bytes, SHA-256 `0ce5f5a6…3ac1ded`; every page inspected.

## G. Approvals requested

1. Membership changes in A (performed by info@ / sales@ / recipients themselves).
2. Choice of path: (a) direct Examinations intake in MISSION_TEST (recommended), or (b) run the copy and separately approve a new confirmation step for stored pending records.
3. Biomarker workflow in D for the 60 definitions, including decisions on 25(OH) Vitamin D, P1NP and CTX.
4. Publication (no code affecting the app changed in P72.1).

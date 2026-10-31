# P49 — Consolidated Demo Readiness Fix: Results

Date: 2026-10-31. No database writes, migrations, RLS, account, membership or publishing changes.

## Changes

- `src/domain/health-intelligence/canonical-projection.ts` (new, pure): read-only projection of three
  stored formats — scalar envelopes (unchanged behaviour), `mitochondria.unified-observation.v1`
  (reviewer-accepted, active, catalog metric, plain decimal) and P22.1/P26 domain entries
  (catalog-validated, numeric value, declared provenance). Original metric ID, unit, time, source ID,
  source label and provenance are kept; handbook quality is reported as `unknown`, never inferred.
  Same record from local and cloud counts once; identical readings (module, metric, unit, instant,
  value, provenance) are charted once; corrections supersede their targets; embedded mission/crew
  identity must match the row. Every in-scope record that is not charted is returned with a reason.
- `src/infrastructure/scientific-evidence.ts` uses the projection; rows carry the stored payload read-only.
- Health pages: series belong to the module named in the stored record; the shared
  `DomainEvidencePanel` is now also on the Bone page; non-charted records listed (grouped with counts).
- Companion: catalog names in the metric picker, a "Stored records not charted" list, provenance column,
  stacked cards below 640 px and a scrollable table above.

## Real-account results (bundled Chromium, 1280×1800 and 390×844)

| Account | Stored | Charted                    | Not charted (reason)                                             |
| ------- | ------ | -------------------------- | ---------------------------------------------------------------- |
| Crew A  | 74     | 27 observations, 20 series | 47 — identical repeats of 3 heart-rate readings (×21, ×21, ×5)   |
| Crew B  | 24     | 23 (unchanged)             | 1 — operational event                                            |
| Crew C  | 53     | 51 (unchanged)             | 2 — 3-axis acceleration (not a single number), operational event |

Crew A by page: Cardiovascular 5 series (HR 6 readings, SBP, DBP, RMSSD, SpO₂); Immune 9 series
(IMM-001/002/003 in both `10^9/L` and `x10^9/L`, kept separate — no unit conversion); Behavioral 4;
Bone 2 (CTX 2 readings, NTX). Crew A heart rate real filter: all/90/30 days = 6, 7 days = 3.
No other crew's IDs in any page; no direct table writes from the browser; no page errors.

## Mocked test (real Crew B sign-in, browser-substituted fixture; nothing stored)

13 synthetic readings, 10 days apart, two sources: all 13 / A 7 / B 6; 90 days 10 (5/5);
30 days 4 (2/2); 7 days 1 (1/0) — identical at desktop and phone sizes.

## Checks

862 tests pass (24 new P49); type check clean; lint 0 errors, 12 existing warnings; formatting pass;
security audit PASS; production build OK; package scan 5 known transitive advisories (unchanged).

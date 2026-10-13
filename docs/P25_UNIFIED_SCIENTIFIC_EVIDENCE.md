# P25 — Unified scientific evidence and governed relationship coverage

This patch adds a working, read-only, authenticated Crew Self scientific evidence view to the existing Health Intelligence route. It projects the existing encrypted local and Supabase-backed mission event records, deduplicates local/cloud copies, filters strictly to the selected mission and crew identity, and displays timestamped numeric observations and source quality.

The report groups measurements by metric code **and unit**, shows successive differences as descriptive changes, and computes a _descriptive historical mean_ only with three or more prior good-quality observations spanning at least 24 hours. This is **not** an approved personal baseline. Existing P10 baseline policy, phase/context matching, and P12 governed trend evaluation remain the only approved pathways for baseline and threshold-based interpretation; this patch does not fabricate missing context or thresholds.

The reviewed P12 cross-domain relationship catalogue is integrated as **evidence-role coverage**, including missing required roles and source IDs. Evidence presence is **not** a matched clinical pattern: there is no temporal co-occurrence validation, directional inference, correlation-derived prediction, diagnosis, autonomous alert, or treatment recommendation. Research-only relationships stay disabled. In particular, a negative literature correlation must never automatically imply that another biomarker will move in the opposite direction.

## Access and navigation

The existing Platform > Health Intelligence route and menu item are reused; no duplicate navigation is added. The UI permits mission selection only from authenticated `crew_self` memberships with an assigned crew ID. Both the infrastructure adapter and pure scientific projector enforce mission/crew scope. Ground Medical, Operator and Researcher do not receive this identifiable view.

## Known limits and next scientific approval gates

This patch is a **complete evidence coverage implementation**, but it does not claim validated multi-biomarker clinical interpretation. Time-matched personal baseline policies, per-pattern permitted directions/time windows, data provenance reconciliation, and independent approval are prerequisites before changing evidence coverage into health findings. The three pending biology documents are not invented or pre-approved. Researcher row-level exports remain subject to the separate privacy hardening workstream and should not be used for one-person cohorts.

No database migration is required. No existing health records are rewritten.

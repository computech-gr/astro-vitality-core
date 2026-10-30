# P47 — Interactive Multi-Biomarker Trends

Adds three explicitly synthetic demonstration series (resting heart rate, HRV, sleep duration), each with labelled day and value points. They are hardcoded illustrations and never enter Supabase, real Crew Self evidence, reports, or clinical decisions.

Authorized Crew Self evidence retains existing mission-scoped loader and metric/unit selector. New read-only filters allow a time window (all, 7, 30, 90 days, relative to latest observation) and exact evidence source, plus an accessible observation table with original unit, timestamp, source and quality. Filters are local presentation only. No medical thresholds, unit conversion, aggregation, diagnosis, migrations, RLS or publication.

Acceptance: synthetic Show/Hide and metric selector; signed-out no private data; Crew Self scoped source/time filters and empty/one-point states; keyboard/mobile; tests, typecheck, lint, security and build. Real Crew Self validation requires an authorized test account.

## Integration acceptance (2026-10-30)

Bundled Chromium, 1280px and 390px, via `tests/navigation/p47-interactive-trends.browser.py`. Signed out: no mission-data requests; all three synthetic series show their label, unit and five points; nothing stored. Crew Self state used stubbed membership and evidence responses (not real authority): four own observations listed, a foreign-crew row excluded, 7-day window and source filters narrowed results to 2 and 1, the one-point message appeared, no horizontal overflow, no page errors. Real signed-in Crew Self acceptance remains open.

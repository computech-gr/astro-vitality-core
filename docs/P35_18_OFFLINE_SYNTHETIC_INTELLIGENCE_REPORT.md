# P35.18 — Offline synthetic intelligence report (bounded delivery)

This patch adds a non-clinical, deterministic, four-domain report to the existing operator launchpad. It uses only the P35.16 fixture, and offers local JSON, CSV, and browser Print/Save PDF. It does not alter navigation, RLS, auth, mission creation, Ground Medical decisions, scientific baselines, or MISSION_TEST records.

## Scope boundary

This is **not** the previously discussed complete integrated administrator demo. The current repository has no approved isolated demo mission or verified administrator authorization, and this patch must not simulate such authorization. Canonical PDF/CSV ingestion, device-to-Cloud data flow, governed mission provisioning, and scientifically reviewed interpretation are not implemented here. They require separate design/approval and implementation. The existing application pages remain intact.

## Acceptance

Verify patch fingerprints, run `bun test tests/mission/p3518-offline-synthetic-report.test.ts`, then one `bun run check`. Browser-check operator report domain filter, JSON/CSV downloads and browser print, no signed-out operator panel, no network writes, no change to MISSION_TEST. No publish/migrations. If an acceptance step cannot be performed, report it as unverified.

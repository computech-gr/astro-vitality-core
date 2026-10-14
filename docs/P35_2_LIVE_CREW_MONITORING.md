# P35.2 — Live Crew Monitoring Readiness (v1.0)

Source baseline: astro-vital-spark (53)(2).zip, after P35.1.

## Scope

Extends existing `/mission/live` Camera PPG, phone motion and Web Bluetooth flows. No new hardware capability or NASA live crew access is claimed. Existing canonical ingestion and encrypted offline append-only storage are retained. UI now distinguishes authenticated mission membership from local fallback, device transport from a received physical sample, and received samples from confirmed encrypted persistence. A failed persistence operation is explicitly shown instead of only logged.

## Boundaries

Local fallback is not authenticated crew identity. Device measurements are not clinically validated. No database migration, no authorization bypass, no automatic cloud sync, no new clinical alert or risk rule, and no change to P30/P35.1 research-only isolation. No private data exported in the hardware evidence receipt. FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED.

## Acceptance checks (Lovable must execute)

1. Verify a real sensor stream updates the received count and last physical sample timestamp.
2. Verify confirmed encrypted writes increment only on successful persistence; force an offline persistence failure and verify a visible warning.
3. Verify local fallback is labeled NOT VERIFIED CREW; verify authenticated mission membership is shown only with actual membership.
4. Verify disconnect, permission denial, unsupported BLE, camera cancellation, offline, and mobile 390px layout.
5. Run project focused tests, full bun run check, typecheck, lint and production build.

This patch is an incremental live-monitoring reliability layer, not complete operational crew monitoring. A separate security review is required before real identifiable crew data is enabled.

# P35 Final Integrated Acceptance — execution handoff v1.0

## Purpose and provenance

Based on repository `astro-vital-spark (56)(2).zip`. P35.1–P35.4 are reported as implemented; this patch adds a **manual, session-only acceptance worksheet**, not evidence that acceptance happened. The canonical P34 15-case and P32 8-gate JSON ledgers remain unchanged. Nine extra P35 scenarios cover NASA OSDR, live sensor persistence, Crew Self isolation, non-clinical alerts, independent security review, and mobile viewport.

## Human execution protocol

1. Deploy only after focused and full automated checks, including regression checks for P35.1–P35.4. Verify production deployment explicitly; publish requests alone do not prove availability.
2. Use authorized distinct accounts for Crew Self, Mission Operator, Ground Medical and Researcher. Test role and mission isolation at both UI and server/RLS levels. Do not impersonate other people or put real patient information into this worksheet.
3. Execute all P34 real-device cases on supported physical devices and document actual hardware/browser/OS, capture timestamp, outcome, and independently verifiable evidence artifact reference. Validate Camera PPG, Bluetooth, permissions, confirmed encrypted writes, failure warnings, airplane-mode capture, reconnect and idempotency.
4. Execute the additional P35 cases. OSDR OSD-48 is mouse (_Mus musculus_) research-only data; no crew identity binding. Verify NASA upstream failures and no synthetic fallback misrepresented as live data. For Crew Self verify empty, stale, error, multi-mission and unauthorized access behavior.
5. Record failures and blocked cases explicitly. Use the worksheet on `/mission/submission` to export a local JSON handoff. The worksheet does **not** persist, upload, digitally sign, approve, or change source ledgers. Treat `pass_observed` as unverified until reviewed by an independent person.
6. Perform fresh independent security scan, server-side access/RLS review and dependency findings disposition. Security gate remains BLOCKED and FV-01-13 remains OPEN until separate authoritative approval.
7. Keep P32 independent scientific gates PENDING. P35.5 awaits three scientific documents from Nikolas; no clinical alerts, certification, NASA endorsement or final submission readiness may be inferred.

## Acceptance criteria

- All 24 cases have real, attributable evidence and independent disposition; no unresolved critical failures.
- 15 P34 cases are not marked completed by UI observation alone; signed/verified artifacts are required in authoritative governance process.
- Eight P32 gates require independent scientific review and are not completed by P35 technical testing.
- FV-01-13 and Final Security Gate cannot be closed by this patch or a downloaded worksheet.
- Mobile submission cards fit 390px viewport; verify visually after deploy.

## Explicit non-goals

No database migration; no new privileged API; no collection of private health data in acceptance form; no live NASA astronaut telemetry; no medical inference or autonomous clinical activation; no modification of P32/P34 ledgers.

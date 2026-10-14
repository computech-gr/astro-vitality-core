# P35 Final Acceptance — Live Mission Identity Initialization Fix

## Root cause

`LiveDashboard` initialized its displayed mission source to `local_fallback` and only resolved `activeLiveMissionContext()` on sensor connection or self-check. A valid signed-in Crew Self could therefore see `LOCAL FALLBACK` on first render despite an active membership on `/mission/identity`.

## Correction

Resolve mission context on dashboard mount and on window focus; update the mission context ref and the readiness label together. Ignore results after unmount. On resolution errors, fail closed (never claim verified membership). Device connection and self-check still independently re-resolve context immediately before capturing or recording events.

## Manual acceptance

1. Sign in as Crew Self for FV01-TEST-A and verify ACTIVE membership in `/mission/identity`.
2. Open `/mission/live` without starting a sensor; after loading, `Mission identity` should read `AUTHENTICATED MEMBERSHIP`.
3. Repeat with Crew Self for FV01-TEST-B, and with a signed-out session; signed-out remains LOCAL FALLBACK.
4. Do not capture real sensor data until the label is verified. This display check alone does not prove database RLS, encrypted persistence or cross-mission isolation.

No migrations, no clinical alerts, no gate changes. FV-01-13 OPEN, P32/P34 PENDING, Final Security Gate BLOCKED.

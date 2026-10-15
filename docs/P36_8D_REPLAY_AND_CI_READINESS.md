# P36.8D — Controlled Replay and CI Readiness (development only)

## Baseline

P36.8A and P36.8C migrations 0009 and 0010 are reported deployed. P36.8D remains `READY_FOR_LIVE_ACCEPTANCE`, never `ACCEPTED` without live independent reviewer evidence. The original eight-value synthetic batch must remain pending and unchanged.

## Replay requirement (step 8)

The dashboard generates one request key per selected batch view. Navigating away clears it. **Do not attempt to recover a key from logs, browser storage or database tables, and do not add a public replay button.**

For automated verification, use the existing disposable PostgreSQL integration suite (`tests/integration-pg/p368c-decisions.sql`), which tests same-key retry, same-key conflicting payload, and simultaneous replay. Record its result and keep it separate from live evidence.

For live acceptance, an authorized independent reviewer may perform one research-only decision on a **new synthetic batch** after explicit owner authorization. To validate same-key replay live, prepare a controlled one-time, reviewer-authenticated test harness using the existing RPC with the exact original request payload and key captured in memory within the same active session, without exposing key, credentials, note or data in logs. The harness must not be deployed publicly or persist the key. Before execution, request separate explicit approval for the live replay and demonstrate the harness cannot decide any other batch or change the payload. Verify identical receipt, exactly one decision event and no extra decision audit. If no such harness is reviewed and authorized, mark step 8 `NOT_RUN` rather than `PASS`.

## GitHub CI

The previous green CI was on `c95b28bc`, before closure files. Record the **new exact HEAD** and corresponding quality/security workflow conclusions. A previous green commit is not evidence for the new commit. Separate preview deployment may remain intentionally skipped.

## Deferred acceptance

Do not publish, run live decisions, alter MISSION_TEST, modify roles, migrate schema, change clinical gates, or update scientific biomarker rules as part of this patch. Preserve `OWNER_MANAGED_BACKUP_RISK_ACCEPTED`; backup not independently verified. Scientific documentation updates await Nikolas's two documents.

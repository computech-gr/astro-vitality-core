# P36.6.3 — Governed activation of synthetic-only Cloud saving

This package contains an **offline evidence gate**, not an automatic database deployment. Owner reports that Lovable Support has confirmed a restore point; the written support confirmation must still be checked against the **actual Lovable Cloud project**. Never commit support evidence, credentials, or backup metadata to GitHub.

## Private recovery evidence

Create a JSON file **outside the repository**, with string fields `cloudProjectId`, `supportReference`, `checkpointUtc`, `verifiedBy`, `restoreOperator`, `restoreProcedure`, `retentionUntilUtc`, `coverageConfirmation`, and values `confirmedLovableCloud: true`, `baselineMigration: 13`, `ownerApproval: true`. Copy only verified facts from the support response. Example command: `node scripts/verify-p3663-activation.mjs /private/path/restore-evidence.json`. Passing this offline check is **not** proof of a restorable backup, nor permission to skip live checks.

## Required live execution by authorized Lovable Cloud operator

1. Independently authenticate the support confirmation; check the checkpoint is **after the last relevant live change and before the first P36 migration**, covers mission/membership/audit data, has a working restore operator, and is not expired. STOP if any detail is missing. Confirm the target is Lovable Cloud, not Supabase project `wlrlzkrbdgiovlzqpuhd`.
2. Immediately before execution: compare actual live migration history (expected ending at 13), confirm absence of P36 objects and pending batches, capture current counts, check no concurrent schema changes, independently review all SQL and full SHA-256 hashes. If anything differs, STOP. Do not assume counts remain 3/7/158; compare against fresh live readings.
3. Apply the **existing** staged SQL through the governed Lovable Cloud migration mechanism, in order: P36.2B10 (migration 14), P36.4 (15), P36.5 (16). Verify each committed migration ID and checksum; stop after any failure. Do not execute SQL through the external Supabase integration. Never silently retry a partially applied migration.
4. Keep `P36_CLOUD_SUBMISSION_ENABLED` **OFF** while checking forced RLS, no browser table grants, authenticated-only RPC execution, 96 exact metric/unit catalogue entries, synthetic-only constraints, no pre-existing batches, Crew Self mission isolation, and revocation. Verify both function definitions and runtime grants; record results privately.
5. Only if all post-migration checks pass, set server-only `P36_CLOUD_SUBMISSION_ENABLED=true`. Deploy/publish according to the existing release procedure; verify the setting is effective server-side, not exposed to browser bundles.
6. Owner signs in as Crew Self on **FV01-TEST-B**, uploads a **synthetic** PDF, selects eight matches, confirms review, saves, repeats Save (must be idempotent), and checks date-ordered history and mission isolation. Until completed, report **ACCEPTANCE PENDING**, not PASS.
7. Confirm GitHub CI and external Supabase deploy remains disabled. Do not touch `MISSION_TEST`.

## Failure and recovery

First turn the server flag OFF and halt writes. Assess whether to restore from checkpoint or run **approved** rollback scripts; P36.4 rollback may delete synthetic submissions, so never execute automatically. Preserve audit evidence where feasible and document downtime and possible data loss. There is no generic P36.2B10 rollback included: **do not improvise a destructive foundation rollback**.

FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED. Records remain synthetic and `pending_review`.

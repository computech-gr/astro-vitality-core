# P36.6.3 — Recovery evidence and live-state reconciliation (25 October 2026)

**STOP: Do not apply P36 migrations again.** Lovable's read-only inspection reports the three P36 migration hashes already recorded in `drizzle.__drizzle_migrations` as journal IDs **7, 8, 9**, with 14 total entries. These are reported live findings, not verified by the offline script. Prior instructions describing pending migrations 14–16 are superseded.

## Offline evidence check

`node scripts/verify-p3663-activation.mjs /private/path/restore-evidence.json`

The evidence file must stay **outside the repository**. It requires verified string fields `cloudProjectId`, `supportReference`, `checkpointUtc`, `verifiedBy`, `restoreOperator`, `restoreProcedure`, `retentionUntilUtc`, `coverageConfirmation`; booleans `confirmedLovableCloud: true`, `ownerApproval: true`; and `baselineMigration: 13`. Here 13 is a **historical checkpoint reference**, not the current journal length and not a claim that P36 was pending. The verifier checks file fingerprints and evidence format only: it does **not** verify live migration IDs, restore success, operator permissions, backup coverage or support statements. Do not invent evidence. A successful result remains `OFFLINE_EVIDENCE_READY_LIVE_CHECKS_REQUIRED`, never production approval.

## Required independent recovery work

1. Confirm backup scope, retention, authorized restore operator and project identity with authoritative documentation or support. A backup list screenshot does not establish restore success.
2. Capture the live migration journal and schema read-only. Independently reconcile P36 IDs 7–9 and all 14 entries; investigate discrepancies without running SQL.
3. Plan an **isolated**, authorized restore exercise with suitable data protections. A database export imported elsewhere tests export recovery, **not** native Lovable backup restoration. Never run in-place production restore as a test.
4. Record actual restoration timestamp, destination, schema and row-count checks, sign-in isolation checks and independent reviewer evidence privately. Do not store secrets or personal data in Git.
5. Keep P3663 **BLOCKED** until the recovery evidence and live checks have genuinely passed. Keep feature flags unchanged, synthetic-only restrictions intact, and no clinical activation.

Other release gates (P3664, P20, independent security/scientific approvals) remain separate and BLOCKED where applicable.

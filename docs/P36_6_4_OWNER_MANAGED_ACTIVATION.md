# P36.6.4 — Owner-managed backup risk acceptance

The owner explicitly waives **independent backup evidence as a deployment prerequisite** and assumes responsibility for taking and maintaining backups. **This does not establish that a backup exists or is restorable.** The potential for irreversible loss of mission, membership, audit and synthetic submission records must be explicitly accepted. This exception applies only to the P36.2B10/P36.4/P36.5 synthetic-only activation, not future releases or scientific/clinical security gates.

## Private approval record (never commit)

Create a JSON file **outside the GitHub repository** containing:

```json
{
  "mode": "OWNER_MANAGED_BACKUP_RISK_ACCEPTED",
  "ownerApproved": true,
  "backupIndependentlyVerified": false,
  "acceptsPotentialIrrecoverableDataLoss": true,
  "authorizesMigrations14To16": true,
  "syntheticOnly": true,
  "baselineMigration": 13,
  "externalSupabaseDeployDisabled": true,
  "approvedAtUtc": "<actual UTC timestamp of owner's authorization>"
}
```

Do not fabricate an approval timestamp, backup, support ticket, restore evidence, or project ID. Obtain the actual timestamp at execution. The authorized operator may record the owner's explicit authorization in a private deployment record. Run `node scripts/verify-p3664-owner-risk.mjs /private/path/owner-risk.json`.

The old P36.6.3 verifier is intentionally **not modified**; it continues to report BLOCKED without support evidence. **Use P36.6.4 as an explicit, separately reported owner-approved exception**, not a false PASS on the old backup check.

## Required live execution

1. Confirm the target is the existing **Lovable Cloud** database, not external Supabase `wlrlzkrbdgiovlzqpuhd`. Confirm that GitHub CI is green and the external Supabase production deployment remains disabled.
2. Re-read live migration history (expected through 13), P36 object absence, current counts and concurrent deployment state. Review the full migration SQL and fingerprints. **STOP** for discrepancies, destructive operations, missing permissions or conflicting migrations.
3. Apply **existing staged** P36.2B10 → P36.4 → P36.5 as governed migrations **14, 15, 16**, once each. Capture committed migration IDs. Stop on failure; do not blindly retry.
4. Keep `P36_CLOUD_SUBMISSION_ENABLED` **OFF** until live post-migration checks prove forced RLS, no browser table grants, authenticated-only RPC, 96 exact metric/unit pairs, synthetic-only restrictions, no unexpected data, Crew Self isolation and revocation.
5. If every post-migration check passes, set the **server-only** flag `P36_CLOUD_SUBMISSION_ENABLED=true` and publish only after the normal release checks. Confirm flag is effective server-side. No real astronaut/clinical data.
6. Owner performs signed-in synthetic-only acceptance on **FV01-TEST-B**: PDF, Select All, manual review, Save, repeat Save (idempotency), history by observation date. Mark acceptance **PENDING** until demonstrated. Never touch `MISSION_TEST`.

## Recovery limitations

With no independently verified backup, there is **no guaranteed database restore**. If activation fails, turn the feature flag OFF first. Existing P36.5 and P36.4 rollback scripts may remove synthetic records; P36.2B10 has no generic rollback. Never automatically execute destructive rollback. Document exact failure and seek owner approval before data loss.

FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED.

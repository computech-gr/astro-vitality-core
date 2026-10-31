# P53 — Medical v3 evidence and owner-approval readiness

**Scope:** documentation and read-only readiness inventory only. P52.1 repaired CI test isolation; P53 does not grant clinical activation, production migration, feature-flag enablement or deployment.

## Gate P3663 — Restore / recovery evidence

Existing gate: `scripts/verify-p3663-activation.mjs <private-restore-evidence.json>`.

Owner must independently obtain and privately retain authentic Lovable Cloud restore/recovery evidence. Required existing verifier fields: `cloudProjectId`, `supportReference`, `checkpointUtc`, `verifiedBy`, `restoreOperator`, `restoreProcedure`, `retentionUntilUtc`, `coverageConfirmation`, `confirmedLovableCloud: true`, `baselineMigration: 13`, `ownerApproval: true`. Timestamps must be valid and retention unexpired. The verifier checks supplied metadata and migration fingerprints, **not** actual cloud restore success. Independently perform and record live recovery checks before any activation claim. Never fabricate evidence or commit the private file.

## Gate P3664 — Explicit owner-managed risk acknowledgement

Existing gate: `scripts/verify-p3664-owner-risk.mjs <private-owner-acknowledgement.json>`.

This is a distinct **risk-acceptance route, not verified backup or restore**. It requires an authorized owner to explicitly accept potential irrecoverable data loss and migration scope, with the exact flags already enforced by the existing script. Do not automatically prepare a signed approval, prefill `ownerApproved`, or infer approval from passing tests. The verifier still reports `liveChecksPerformed: false` and `backupVerified: false`. A risk waiver cannot be presented as a restore drill.

## Gate P20 — Official NASA Space Apps 2026 rules

Existing sources: `data/submission/p20-evidence.v1.json` and `data/submission/p20-final-external-evidence.v1.json`. The latter currently has `official2026SubmissionRules.status: pending_external`. Obtain and record the genuine official 2026 rules URL and manually re-check submission fields, judging instructions and rights requirements before changing statuses. Do not substitute prior-year rules or invented links. Validate the video URL and actual media independently; a `ready` ledger entry is not proof the final MP4 exists.

## Operator sequence

1. Keep P3663, P3664 and P20 **BLOCKED** pending actual evidence.
2. Run `node scripts/verify-p53-evidence-readiness.mjs` to verify only this preparation register.
3. Have the owner obtain private evidence and review the exact existing gates without exposing identifiers or signatures in Git.
4. Run the existing gate verifiers only against authentic private files in an authorized secure environment. Never weaken their conditions or alter their results.
5. Separately complete any required live Cloud, restore, RLS, security and operational checks; obtain specific migration/activation/deployment approvals if ever proposed.
6. Verify the latest GitHub Quality and Security workflows on the exact commit. Report the three external blockers separately.

## Hard boundaries

No SQL execution; no Supabase/Lovable Cloud connection; no data writes; no auth/RLS/role changes; no mission or health-record modifications; no activation; no publication. P53 preparation is not a medical release sign-off.

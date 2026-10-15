# P36.6 — Controlled synthetic Cloud activation and GitHub release

**Scope:** owner authorization received to prepare and conditionally execute the three staged migrations in the shared Lovable Cloud database. This document is NOT evidence of deployment. No clinical use, no real astronaut data, and no scientific approval.

## Mandatory stop/go procedure

1. Confirm canonical production Supabase project and GitHub repository from authenticated project configuration. Never infer either from a ZIP or preview URL. Record migration hashes with `node scripts/verify-p366-cloud-release.mjs`.
2. Compare all three SQL files to the actual live schema, existing migrations, RLS, grants, functions, mission memberships, and existing P36 objects. Review security-definer functions for least privilege and secure `search_path`. Stop on drift, conflicts, unexplained objects or unexpected data.
3. Confirm a verified restore checkpoint, recovery operator, and rollback limitations. The P36.4 undo is potentially destructive to synthetic records; never execute undo automatically. Disabling the feature flag is the immediate safe rollback.
4. Apply migrations in order using the established governed migration mechanism, exactly once: P36.2B10 foundation, P36.4 submission, P36.5 history. Never paste them into a public client or auto-apply merely because this document exists.
5. Run read-only post-deploy checks: P36 tables forced RLS and deny-all, no browser table grants, only intended authenticated RPC execution, exact 96 metric/unit catalogue pairs, expected baseline batch counts, no real records. Stop and disable feature if any discrepancy.
6. Enable `P36_CLOUD_SUBMISSION_ENABLED=true` only in the server runtime after the checks pass. Verify that the feature flag is actually read by the deployed service; do not put secrets or private configuration in public GitHub files.
7. Test a synthetic-only authenticated Crew Self workflow on existing FV01-TEST-B: local PDF, exact matches, Select All, manual confirmation, Save, retry idempotency, and own history sorted by observation date. Never impersonate another user. Require actual server confirmation; if authorized session is unavailable mark acceptance PENDING.
8. Run complete project checks, review `.gitignore` and changed files for credentials, private records, local backups, generated secrets. Publish code to the canonical MITOCHONDRIA repository via reviewed PR/established release workflow; capture URL, commit SHA, CI status. A ZIP upload is not a GitHub push.
9. Publish application only after checks, and record live route, deployment revision and end-to-end acceptance. If verification fails, disable writes and report BLOCKED rather than claiming success.

## Boundaries

- No modifications to MISSION_TEST or its linked astronaut; FV01-TEST-B synthetic-only acceptance.
- No original PDF Cloud storage; reviewed synthetic values only.
- Pending-review is not scientific approval; no clinical activation.
- Database owners remain capable of bypassing database-level controls. Operational audit and role separation remain outstanding.
- FV-01-13 OPEN; P32 and P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED.

## Release evidence checklist

Record migration hashes and IDs, preflight findings, backup verification, live table counts, grants/RLS verification, feature flag confirmation, authenticated test result, GitHub URL/branch/SHA/CI, publication status, deviations and rollback owner. No unverified PASS claims.

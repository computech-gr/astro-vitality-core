# P36.8C migration 0010 — governed deployment gate

This file documents the owner's deployment approval boundary. It is not evidence that deployment or live acceptance occurred.

## Approved candidate

- Source: `supabase/pending/20261021000000_p368c_research_decisions.sql`
- SHA-256: `7a233de35794684da7dfc4ffd7b657c3a545bf0f96a1d6f86733853bae4f07f1`
- Governed target: `drizzle/migrations/0010_p368c_research_decisions.sql`
- Rollback remains manual and owner-run, and is unsafe once research decisions exist.

## Pre-deployment stop conditions

Stop for unexpected migration history/schema drift, SHA mismatch, changed trigger/RPC dependencies, or unexpected changes to FV01-TEST-B membership and the one pending 8-item synthetic batch. Never operate on MISSION_TEST or external Supabase.

## Post-deployment verification

Verify migration recorded once, RPC signature and EXECUTE grants, anonymous denial, direct table protections, existing 8-item batch still pending, zero live decision events, and unchanged biomarker values. Run disposable PostgreSQL concurrency/revocation tests and full quality checks. Do not make a live decision, publish, or claim live acceptance in this step. Normal deployment bookkeeping/audit changes must be reported rather than silently asserting every count is unchanged.

## Preserved gates

OWNER_MANAGED_BACKUP_RISK_ACCEPTED is an owner risk waiver, not verified backup. FV-01.13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical features DISABLED.

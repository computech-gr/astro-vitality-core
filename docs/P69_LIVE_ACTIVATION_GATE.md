# P69/P71 NASA live demo — activation gate

Status: REVIEW REQUIRED. This document does not authorize migration, secret changes, deployment, or public enablement.

## Observed from 2026-11-14 18:53 ZIP
- Pending SQL: `supabase/pending/20261114000000_p69_public_demo_workspaces.sql`; rollback is present.
- Public entry is default-off and requires `P69_PUBLIC_DEMO_ENABLED=true` plus a server-only salt.
- Server creates random Supabase Auth users with synthetic role metadata; role/workspace actions use caller-scoped RPCs.
- `provisionPublicDemoRole` attempts user deletion if provisioning fails, but a sign-in failure returns unavailable without deleting the newly created user. Review cleanup semantics and retry/idempotency before activation.
- Client-address rate limiting derives an address from `cf-connecting-ip` or `x-forwarded-for`; verify trusted reverse-proxy behavior, spoofing resistance, and missing-IP handling in the actual deployment.
- The three role buttons do not impersonate existing named accounts; Alex Morgan is a synthetic demo subject, not the existing crew record.

## Mandatory preflight
1. Review the entire SQL migration and rollback with a database administrator, including grants, RLS, SECURITY DEFINER functions, search_path, schema privileges, and auth user lifecycle.
2. Confirm backup/recovery and current schema baseline; test migration and rollback on isolated staging matching production.
3. Inspect admission and join-code abuse resistance, workspace sharing, expiration and cleanup, global quotas, and denial-of-service/cost limits.
4. Confirm actual deployed server supports server-only secrets, secure cookies, and correct proxy trust configuration.
5. Fix or justify failed-sign-in orphan identity cleanup; add regression tests.
6. Perform three independent browser-profile live end-to-end rehearsal, including role restrictions, cross-workspace denial, stale revisions, refresh and final astronaut visibility.
7. Test Medical entry of new synthetic exam and Researcher/Medical review of that exact record.
8. Confirm public pages do not expose personal data or real-account credentials; verify standard sign-in remains intact.
9. Confirm four shared metrics across all four domains, exact units, source/provenance and measurement-site rules.
10. Check accessibility, mobile behavior, media and public competition links; capture evidence without personal data.
11. Obtain separate explicit approvals for database migration, server secret configuration, live activation and publication.

## Operational demo script
- Profile A: Astronaut; create workspace and copy join code; enter synthetic exam.
- Profile B: Researcher; join same workspace and assess the record.
- Profile C: Medical; join same workspace, review the same record and optionally enter a new synthetic exam.
- Profile A: refresh and observe permitted final outcome.
- Use offline rehearsal only as a clearly labeled fallback, never as evidence of live persistence.

## Guardrails
Do not embed real passwords or Supabase service keys in client code. Do not link public demo sessions to real users or existing mission records. Do not weaken scientific/medical safeguards, alter owner evidence, or bypass release gates. Preserve original Lovable GitHub integration and public competition repository links.

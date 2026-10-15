# P36.6 — GitHub CI security recovery

## Trivy Security Scan

- Failure: job `trivy`, step "Set up job" failed (run 38737385915, commit `d498637d`). The workflow referenced
  `aquasecurity/trivy-action@0.28.0`; after advisory GHSA-69fq-xp46-6x23 (CVE-2026-33634) all unprefixed tags
  below 0.35.0 were removed, so the action could not be resolved.
- Fix: `aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25` (v0.36.0, GitHub immutable release)
  and `actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955` (v4.3.0) with `persist-credentials: false`.
- Historical exposure: the advisory exposure window was 2026-03-19 to 2026-03-23. This repository was created
  2026-09-19 and the Security Scan workflow has never completed a successful run; each run failed before any
  action code was downloaded. No compromised action code executed here, so no secret rotation is indicated.
  The workflow has `contents: read` only and uses no repository secrets.

## Supabase Preview integration (not Lovable Cloud)

- A separate "Supabase" GitHub App posts a "Supabase Preview" check on pushes. Its target project ref is
  `wlrlzkrbdgiovlzqpuhd`, which is NOT this project's Lovable Cloud backend.
- That app's documented behaviour: launches preview branches for pull requests and runs `supabase/migrations`
  against its linked production project when changes merge to the production branch.
- Status: not deleted or disconnected. Isolation requires the owner of that external project to disable
  branching/automatic migrations or remove the app's access to this repository. Until then, every governed
  migration added to `supabase/migrations` may also be applied to that external database.
- `supabase/pending/` is not read by that integration.

## Unchanged

No application features, database migrations, Cloud saving, publication or MISSION_TEST changes.
FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED.

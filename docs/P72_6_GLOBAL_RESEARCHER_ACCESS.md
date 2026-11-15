# P72.6 — Global Researcher read access across all missions

Status: **Preview code ready; database change staged, NOT applied.** No publication or deployment.

## Root cause
The Researcher console warning comes from `p72TargetMembership`, which only looks at real
`mission_memberships` rows. Every mission read path (identity loader, observation download,
review download, demo catalog snapshot) also requires a membership in that exact mission;
`nikolasilvestros@gmail.com` holds a Researcher membership only in FV01-TEST-B. The existing
global scientific-review grant covers de-identified review queues only, not examinations.

## Design
- New SQL-provisioned grant table `p726_global_research_readers` (no client access) plus an
  append-only audit table. Granting = one owner-approved INSERT (authorize file). No membership rows.
- `p726_global_research_scope_v1()` lists every mission (current and future) with active crew;
  `p726_global_research_can_read(mission, crew, provenance)` answers synthetic-only reads.
- Four existing READ RPCs gain one `or p726_global_research_can_read(...)` clause each:
  `observation_sync_list_v1`, `review_sync_list_v1`, `p37_demo_catalog_snapshot_v1`,
  `p615_demo_alias_snapshot_v1`. All write RPCs, table policies and gating helpers are unchanged.
- App: the identity loader adds a separate `globalResearch` field (never merged into memberships);
  the Researcher console shows the access instead of the warning; new read-only page
  `/mission/research-access` (all missions → crew → download to device, Examinations, Health
  Domains); the Full Health Report lists the read scopes synthetic-only with export re-checked.
  Server download accepts the grant for synthetic pulls only; uploads still need crew/Medical.
- Scientific Review queues and the six submitted requests are unchanged (existing global review grant).

## Files
- `supabase/pending/20261115000000_p726_global_researcher_read.sql` (+ `.rollback.sql`, restores the
  exact live bodies) and `20261115000001_p726_global_researcher_read.authorize.sql`.
- `scripts/verify-p726-global-research-pg.ts` — disposable socket-only PostgreSQL verifier.
- `src/domain/mission-access/global-research-scope.ts`, `src/infrastructure/mission-identity.ts`,
  `src/lib/observation-sync.server.ts`, `src/lib/observation-sync.functions.ts`,
  `src/components/mission-access/global-research-access.tsx`, `src/routes/mission.research-access.tsx`,
  `src/components/mission-access/p72-mission-context-bar.tsx`, `src/components/astronaut-health-report.tsx`,
  `src/components/synthetic-demo-catalog-auto-refresh.tsx`, `src/infrastructure/seo.ts`.
- `tests/mission/p726-global-researcher-read.test.ts`.

## Evidence
- Disposable PostgreSQL 17 (socket `/tmp/p36-unified/socket-p726`): 90 assertions PASS — anonymous
  denied; ungranted/revoked/no-role denied; reader lists all missions incl. a future one; reads
  synthetic observations/reviews/catalogs without membership; REAL, unassigned crew and unknown
  missions denied; no Ground Medical/operator/crew role gained; only the four read RPC bodies change
  (verified textually against the live definitions); Astronaut and Ground Medical unchanged; audit
  append-only; data fingerprint unchanged; rollback restores exact bodies.
- Unit tests: 1,961 pass (12 new).
- Not verified: the live signed-in Researcher flow, which needs the staged SQL applied first.

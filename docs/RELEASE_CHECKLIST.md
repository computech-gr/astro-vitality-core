# Release candidate checklist

Before creating a P19 release tag:

- [ ] `bun install --frozen-lockfile` succeeds.
- [ ] `bun run check` succeeds.
- [ ] `bun run verify:p19` succeeds.
- [ ] security workflow is green.
- [ ] migration directory contains exactly the five governed P15/P16/P20 migrations with no duplicate SQL content.
- [ ] `bun run setup:local` succeeds on a clean machine with Docker and Supabase CLI.
- [ ] `supabase db reset --local` applies migrations and synthetic seed from scratch.
- [ ] `bun run sample:release` creates deterministic synthetic sample data.
- [ ] `docker compose --env-file .env.local up --build` builds and serves the app locally.
- [ ] container HTTP smoke checks pass for `/` and `/mission/simulation`.
- [ ] no secrets or real medical data are tracked.
- [ ] known limitations remain current.
- [ ] scientific baseline remains v1.1 unless a controlled review supersedes it.
- [ ] challenge-development tag uses `v0.x`, not `v1.0`.

# Release candidate checklist

Before creating a P19 release tag:

- [ ] `bun install --frozen-lockfile` succeeds.
- [ ] `bun run check` succeeds.
- [ ] `bun run verify:p19` succeeds.
- [ ] security workflow is green.
- [ ] `bun run setup:local` succeeds on a clean machine with Docker and Supabase CLI.
- [ ] local migrations and seed apply from scratch.
- [ ] `bun run sample:release` creates deterministic synthetic sample data.
- [ ] `docker compose --env-file .env.local up --build` serves the app locally.
- [ ] no secrets or real medical data are tracked.
- [ ] known limitations remain current.
- [ ] scientific baseline remains v1.1 unless a controlled review supersedes it.
- [ ] challenge-development tag uses `v0.x`, not `v1.0`.

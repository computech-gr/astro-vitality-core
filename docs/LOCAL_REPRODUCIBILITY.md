# Local reproducibility

P19 packages The Mitochondria so an independent machine can reproduce the current release candidate without Lovable being the only execution path.

## Prerequisites

- Git
- Bun 1.x
- Docker Engine/Desktop with Docker Compose v2
- Supabase CLI

No production secret is required for the local release-candidate path.

## Fresh-clone path

```bash
git clone https://github.com/computech-gr/astro-vitality-core.git
cd astro-vitality-core
bun install --frozen-lockfile
bun run setup:local
bun run check
bun run dev
```

`setup:local` starts local Supabase, resets the local database through the repository migrations and `supabase/seed.sql`, derives browser-safe local configuration from `supabase status`, and writes it only to `.env.local`.

The setup script never writes the local service-role key into application environment files.

## Canonical migration chain

The fresh-clone database path uses exactly the seven governed migrations currently retained in the repository, in timestamp order:

1. P15 Ground / Research Console base migration.
2. P15 helper-privilege hardening correction.
3. P16 Security & Safety Hardening base migration.
4. P16 pgcrypto/search-path correction.
5. P20 Mission Identity & Invites.
6. P20 Mission & Crew Operations.
7. P20 Secure Bootstrap & Auth Readiness.

Platform-generated or earlier semantic-name copies that duplicated governed migration content are intentionally removed. P19 verification requires this exact seven-migration chain and rejects duplicate SQL content so `supabase db reset --local` remains reproducible.

## Docker application path

Start Supabase first:

```bash
bun run setup:local
```

Then build/run the application image with the generated local environment:

```bash
docker compose --env-file .env.local up --build
```

Open `http://localhost:3000`.

The normal Lovable production build emits the application server handler at `dist/server/index.mjs` and browser assets under `dist/client`. The container therefore runs the repository-owned `scripts/serve-dist.mjs` adapter rather than assuming an unused `.output/server/index.mjs` Nitro artifact. The same application code and security-header boundary are preserved.

The browser-visible Supabase URL remains `http://127.0.0.1:54321`; the server container reaches the local Supabase gateway through `host.docker.internal`.

## Reset

```bash
supabase db reset --local
```

To stop the application container:

```bash
docker compose down
```

To stop the local Supabase stack:

```bash
supabase stop
```

## Sample data

`bun run sample:release` writes a deterministic Mission Day 127 JSON dataset to `data/release/mission-day-127.synthetic.json`. The generator is P17 and all generated health observations remain explicitly classified/tagged synthetic.

## Release-candidate CI reproduction

The `Release Candidate` workflow installs the Supabase CLI, runs the full quality/security gate, starts/reset local Supabase from repository migrations and seed, builds the Docker image, boots it, and performs HTTP smoke checks against both `/` and `/mission/simulation`.

## Reproducibility boundary

The P19 exit gate demonstrates source, migration, synthetic-data and application reproducibility. It does not claim target-wearable battery characterization, clinical validation, or production infrastructure parity with the challenge deployment.

## Local Auth contract

`supabase/config.toml` versions the local Email Auth contract, local Site URL and mission identity redirect. `bun run setup:local` therefore reproduces the authentication provider needed by `/mission/identity` without dashboard-only local state. Production Auth configuration is intentionally separate from local config and must be verified through the authorized project-management surface.

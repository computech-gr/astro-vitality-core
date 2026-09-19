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

## Reproducibility boundary

The P19 exit gate demonstrates source, migration, synthetic-data and application reproducibility. It does not claim target-wearable battery characterization, clinical validation, or production infrastructure parity with the challenge deployment.

# P19 Independent Reproduction Gate

This gate closes P19 only when the release candidate is reproduced from the canonical GitHub repository in a clean environment that does not reuse the active Lovable workspace, its `node_modules`, `.env.local`, local Supabase state, Docker containers, or build artifacts.

## Independence requirement

Acceptable evidence comes from a separate machine, VM, CI runner, or newly provisioned clean workspace. The operator records the exact Git commit before running the gate. No production secret is required.

## Prerequisites

- Git
- Bun 1.x
- Docker Engine/Desktop with Docker Compose v2
- Supabase CLI

## Reproduction procedure

From an empty working directory:

```bash
git clone https://github.com/computech-gr/astro-vitality-core.git
cd astro-vitality-core
git rev-parse HEAD
bun install --frozen-lockfile
bun run verify:p19
bun run check
bun run setup:local
supabase db reset --local
bun run sample:release
docker compose --env-file .env.local up -d --build
```

Verify the self-hosted application:

```bash
curl --fail --silent --show-error http://127.0.0.1:3000/ >/tmp/mitochondria-home.html
grep -qi "Mitochondria" /tmp/mitochondria-home.html
curl --fail --silent --show-error http://127.0.0.1:3000/mission/simulation >/dev/null
```

Confirm local database reproduction and migration integrity:

```bash
supabase migration list --local
find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | sort
```

The repository must contain exactly the seven governed migrations documented in `docs/LOCAL_REPRODUCIBILITY.md`, with no duplicate SQL content. `bun run verify:p19` is the authoritative repository gate for this invariant.

## Evidence to retain

Record:

- execution date/time and independent environment description;
- exact Git commit SHA;
- Bun, Docker and Supabase CLI versions;
- frozen install result;
- `bun run verify:p19` result;
- full `bun run check` result;
- local Supabase start/reset result;
- deterministic sample-generation result;
- Docker build/start result;
- HTTP smoke results for `/` and `/mission/simulation`;
- confirmation that no production secrets were required or copied into the clean environment;
- any deviation, warning or manual intervention.

Do not mark P19 independent reproduction complete if the run reuses the existing configured development workspace or if any mandatory command is skipped.

## Cleanup

```bash
docker compose down
supabase stop
```

## Closure rule

P19 independent reproduction is PASS only when the clean environment completes the procedure without repository modification, hidden dashboard state, production credentials, migration repair, or manual database editing. The recorded commit and evidence must correspond to the candidate that will be used for the challenge submission.

# Development Guide

## Prerequisites

- Git
- Bun 1.x

## Clone and install

```bash
git clone https://github.com/computech-gr/astro-vitality-core.git
cd astro-vitality-core
bun install --frozen-lockfile
```

## Environment

```bash
cp .env.example .env
```

For the current public shell, private production secrets are not required. Populate browser-safe Supabase values only when exercising code that uses the generated Supabase client.

Never commit `.env`.

## Run locally

```bash
bun run dev
```

The canonical production origin remains `https://mitochondria.edocinfo.com`. Local development and preview origins are not canonical.

## Quality checks

```bash
bun run typecheck
bun run lint
bun run format:check
bun run build
```

Or run the complete P2 foundation and quality gate:

```bash
bun run check
```

## Production preview

```bash
bun run build
bun run preview
```

## Lockfile discipline

`bun.lock` is the repository lockfile. CI and reproducibility checks use:

```bash
bun install --frozen-lockfile
```

Do not generate a second package-manager lockfile unless the project deliberately changes package-manager strategy.

## Troubleshooting

- If TypeScript fails, run `bun run typecheck` directly for focused output.
- If lint fails on formatting, run `bun run format`, review the diff, then rerun `bun run check`.
- If Supabase code reports missing configuration, confirm `.env` contains the browser-safe values described in `.env.example`.
- Do not solve local configuration failures by committing secrets.

# The Mitochondria

**Open-source, offline-first astronaut health intelligence for long-duration human spaceflight.**

The Mitochondria is an independent project being developed for the **2026 NASA International Space Apps Challenge**. Its long-term direction is to combine physiological, biological, cognitive, behavioral, environmental, and radiation context into personalized, explainable health decision support for crews operating far from Earth.

> This project is independently created. It is not endorsed, certified, sponsored, or operated by NASA.

Production: **https://mitochondria.edocinfo.com**

## Current status

The repository is in **P2 — Repository & Open-Source Foundation**. The public mission shell, layered application structure, PWA manifest, canonical-origin safeguards, and Supabase client scaffolding exist. Health monitoring, clinical logic, sensor adapters, mission data models, authentication workflows, and database schema are intentionally **not yet implemented**.

## Architecture principles

- **Open source:** Apache-2.0 licensed and reproducible from source.
- **Offline-first direction:** critical mission-health workflows are designed to keep operating through delayed, intermittent, or absent connectivity.
- **Device-agnostic:** future data sources integrate through explicit adapters rather than vendor-specific application logic.
- **Human-in-the-loop:** the platform supports astronaut and medical decision-making; it is not an autonomous doctor.
- **Explainable:** future alerts and patterns must preserve evidence, uncertainty, provenance, and data-quality context.
- **Safety-bounded:** no unsupported diagnosis, clinical threshold, or medical claim is accepted into operational logic.

## Technology stack

- TypeScript
- React 19
- TanStack Start / TanStack Router
- Vite
- Tailwind CSS
- Supabase JavaScript client scaffold
- Bun lockfile and package workflow

## Repository architecture

```text
src/
  app/              application-layer boundary
  components/       reusable UI and public application shell
  domain/           future vendor-neutral domain model
  infrastructure/   runtime configuration and infrastructure concerns
  integrations/     external-system adapters, including Supabase
  routes/           TanStack Start routes
  lib/              shared technical utilities
public/              static public assets and PWA manifest
supabase/            Supabase project configuration; no P2 schema migrations
docs/                architecture, development, open-source, and security docs
.github/workflows/    CI quality gates
```

See [`docs/REPOSITORY_STRUCTURE.md`](docs/REPOSITORY_STRUCTURE.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Prerequisites

- Git
- [Bun](https://bun.sh/) 1.x (current project lockfile/package workflow)

Node.js is used by parts of the toolchain transitively, but repository commands are standardized on Bun for deterministic installation from `bun.lock`.

## Local setup

```bash
git clone https://github.com/computech-gr/astro-vitality-core.git
cd astro-vitality-core
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

The current public shell does not require private production secrets to build. If Supabase-backed code is exercised locally, populate the browser-safe Supabase values in `.env` from the environment you are authorized to use.

## Environment

Start from:

```bash
cp .env.example .env
```

Never commit `.env`, service-role keys, database passwords, access tokens, JWT secrets, or other server-only credentials.

Current browser configuration names are documented in [`.env.example`](.env.example). Server-only Supabase credentials are intentionally not required by the P2 public shell.

## Development commands

```bash
bun run dev           # local development server
bun run typecheck     # TypeScript validation, no emit
bun run lint          # ESLint
bun run format        # apply Prettier formatting
bun run format:check  # verify formatting
bun run build         # production build
bun run preview       # preview production build
bun run check         # foundation verification + typecheck + lint + format:check + build
```

## Quality gate

Before opening a pull request:

```bash
bun install --frozen-lockfile
bun run check
```

CI runs the same core gates on pull requests and pushes to `main`.

## Scientific and medical boundary

- No real astronaut or patient medical data belongs in this public repository.
- Demo data must be synthetic or explicitly cleared for public use.
- Scientific claims require traceable evidence.
- Medical thresholds, escalation logic, and operational health guidance require qualified scientific/medical governance before implementation.
- The platform must not present experimental pattern detection as diagnosis.

## Open-source governance

- License: [`LICENSE`](LICENSE) — Apache-2.0
- Contributions: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Security reporting: [`SECURITY.md`](SECURITY.md)
- Scientific/resource citations: [`CITATIONS.md`](CITATIONS.md)
- Contributor conduct: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- Open-source direction: [`docs/OPEN_SOURCE.md`](docs/OPEN_SOURCE.md)

## NASA Space Apps 2026

Challenge site: https://www.spaceappschallenge.org/2026/

The project may reference NASA public resources and challenge materials. Such references do not imply NASA endorsement. Sources used by the project are tracked in [`CITATIONS.md`](CITATIONS.md).

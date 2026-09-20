# The Mitochondria

**Open-source, offline-first astronaut health intelligence for long-duration human spaceflight.**

The Mitochondria is an independent project being developed for the **2026 NASA International Space Apps Challenge**. Its long-term direction is to combine physiological, biological, cognitive, behavioral, environmental, and radiation context into personalized, explainable health decision support for crews operating far from Earth.

> This project is independently created. It is not endorsed, certified, sponsored, or operated by NASA.

Production: **https://mitochondria.edocinfo.com**

## Current status

The repository has completed **P18 — Validation & Usability** and now adds **P19 — Open-Source Release Candidate**. The controlled stack includes canonical mission-health data, device/wearable/lab/environment integration, live astronaut monitoring, personal baselines, cognitive/behavioral assessment, explainable health intelligence, bounded protocol guidance, encrypted offline operation, authenticated Ground/Research persistence and security hardening. P19 packages the validated prototype for independent reproduction with Docker, local Supabase, deterministic synthetic sample generation, release documentation, and contribution templates. It remains a non-clinically-validated challenge prototype.

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
  domain/           P3/P4 mission-health contracts, reviewed metric registry, ingestion and serialization
  infrastructure/   runtime configuration and infrastructure concerns
  integrations/     external-system adapters, including Supabase
  routes/           TanStack Start routes
  lib/              shared technical utilities
public/              static public assets and PWA manifest
supabase/            Local Supabase config, governed migrations, and synthetic-only seed data
docs/                architecture, domain/science governance, development, open-source, security
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

Current browser configuration names are documented in [`.env.example`](.env.example). Server-only Supabase credentials are intentionally not required by the current public shell or P3 domain-contract tests.

## Development commands

```bash
bun run dev           # local development server
bun run test          # P3/P4 domain and canonical-data tests
bun run typecheck     # TypeScript validation, no emit
bun run lint          # ESLint
bun run format        # apply Prettier formatting
bun run format:check  # verify formatting
bun run build         # production build
bun run preview       # preview production build
bun run check         # P2-P19 verification + security audit + tests + typecheck + lint + format + build
```

## Quality gate

Before opening a pull request:

```bash
bun install --frozen-lockfile
bun run check
```

CI runs the same core gates on pull requests and pushes to `main`.

## P4 canonical health-data foundation

The canonical domain contracts live in `src/domain/`. See [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md), [`docs/CANONICAL_HEALTH_DATA.md`](docs/CANONICAL_HEALTH_DATA.md), [`docs/SCIENTIFIC_GOVERNANCE.md`](docs/SCIENTIFIC_GOVERNANCE.md), and [`docs/SCIENTIFIC_BASELINE_V1_1.md`](docs/SCIENTIFIC_BASELINE_V1_1.md). P4 uses the reviewed v1.1 scientific baseline without turning research-only markers or contextual associations into diagnosis or autonomous medical logic.

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

### P5 device adapter SDK

The repository now includes the vendor-neutral Universal Device Adapter SDK and a deterministic conformance fixture. No real wearable integration is claimed in P5; adapters must normalize through the reviewed P4 canonical health-data boundary. See `docs/DEVICE_ADAPTER_SDK.md`.

### P6 wearables integration pack

P6 adds direct Web Bluetooth heart-rate ingestion, host-provided Android Health Connect and Apple HealthKit bridge adapters, and a credential-free vendor-cloud adapter boundary. Three distinct source classes are tested through the same P4 canonical metric path. See `docs/WEARABLES_INTEGRATION.md`.

### P7 — Medical & laboratory integration

The repository now includes governed CSV/FHIR laboratory import, a manual biomarker-entry fallback, and medical-device normalization for SpO2 and blood pressure. All P7 inputs remain constrained by the reviewed v1.1 canonical metric catalogue and preserve provenance; P7 does not introduce clinical thresholds, diagnosis, database migrations, or persistence claims.

### P8 — Environmental & radiation telemetry

P8 adds governed habitat/environment telemetry and personal-radiation dosimetry adapters. Reviewed CO2, O2, pressure, thermal, humidity, noise, light, CO, and radiation quantities converge on the same P4 canonical observation model while unreviewed vendor metrics fail closed. P8 does not add habitat thresholds, biological radiation-risk scoring, database persistence, or credentials. See `docs/ENVIRONMENTAL_RADIATION_TELEMETRY.md`.

### P9 — Astronaut Live Dashboard

The `/mission/live` route now provides the first astronaut-facing live console. It can consume the real P6 browser BLE heart-rate path, presents canonical observation quality/freshness and source state, and keeps missing feeds explicitly disconnected/waiting. P9 remains session-local: database persistence, personal-baseline interpretation and offline store-and-forward are not claimed here.

## P10 — Personal Baseline Engine

The current foundation includes a versioned personal-baseline engine for numeric canonical metrics reviewed for longitudinal baselining. It preserves immutable pre-flight references, phase-aware comparator selection, explicit quality/context gates and personalized deltas. The live dashboard can display a baseline delta only when a validated profile is supplied; it does not invent a baseline, clinical threshold, alert or diagnosis. See `docs/PERSONAL_BASELINE_ENGINE.md`.

## P11 — Cognitive & Behavioral Module

The current foundation includes `/mission/readiness`, a private cognitive/behavioral assessment flow aligned to scientific baseline v1.1. P14 encrypts accepted readiness records locally and queues them for governed store-and-forward synchronization. It captures schedule context, fatigue, KSS sleepiness, state stress and a brief vigilance measurement path without generating a psychiatric diagnosis, fitness-for-duty label, readiness score, alert or treatment recommendation. The 60-second vigilance task is explicitly a software demo protocol; operational use requires a governed validated protocol. Task-linked NASA-TLX raw subscales are available as optional context outside the required <3-minute daily demo flow.

### P12 — Health Intelligence v1

The repository now contains a non-diagnostic, evidence-weighted Health Intelligence layer with caller-governed trend policies, reviewed multi-signal pattern definitions, explicit confidence decomposition and explainable findings. The `/mission/intelligence` surface shows the reviewed pattern catalogue and does not invent health data. Protocol/action guidance remains P13 scope.

### P13 — Action & Protocol Guidance

P13 adds a versioned, non-diagnostic protocol library and action-card engine above P12 findings. Reviewed findings may map to bounded repeat/quality, recovery/workload, hydration/nutrition, exercise-countermeasure or environmental-review categories. Research-only findings are blocked from operational action, data-quality findings route to re-measurement, and medical escalation requires a separately governed authority/versioned trigger. `/mission/guidance` exposes the library without fabricating session evidence. P14 now provides encrypted local persistence and queue semantics for future action/acknowledgement records; ground audit persistence remains part of the authorized backend/ground work. See `docs/ACTION_PROTOCOL_GUIDANCE.md`.

### P14 — Offline Mission Mode

P14 adds AES-GCM encrypted IndexedDB persistence, an append-only mission event log, locally cached/versioned P13 protocols, a store-and-forward queue, deterministic conflict semantics, and an offline application shell. The cloud remains outside the critical sensor-to-astronaut path. Production Supabase synchronization is intentionally not claimed until the mission/crew-authorized backend boundary is connected.

- Mission UI: `/mission/offline`
- Design: [`docs/OFFLINE_MISSION_MODE.md`](docs/OFFLINE_MISSION_MODE.md)

### P15 status

Ground/research role boundaries, authenticated store-and-forward persistence, audit events and de-identified research export are now represented in the repository. P16 remains responsible for full security/threat-model hardening.

### P16 — Security & Safety Hardening

P16 adds the project threat model, misuse-case regression set, SSR security headers, secret/server-boundary audit, RLS/RPC hardening, replay-conflict protection and safer pseudonymized research export. It does not add clinical authority or change the scientific baseline.

### P17 — Simulation & Synthetic Mission Dataset

P17 adds deterministic synthetic mission scenarios for reproducible challenge demos and regression testing. `Mission → Mission Scenario` opens `/mission/simulation`, where the controlled Mission Day 127 scenario and focused artifact/CO2/radiation cases can be generated repeatedly from fixed seeds, inspected and exported as synthetic JSON. Generated observations pass through the P4 canonical ingestion boundary and are always classified/tagged as synthetic. The generator includes explicit artifact, missing-data, CO2 non-causality, radiation-no-risk-score and offline/reconnect guardrails. See [`docs/SIMULATION_SYNTHETIC_DATASET.md`](docs/SIMULATION_SYNTHETIC_DATASET.md).

### P18 — Validation & Usability

P18 adds `/mission/validation`, a controlled validation evidence ledger, critical workflow review, accessibility and cognitive-load checks, engineering latency evidence, and explicit known limitations. Critical manual criteria cannot pass without recorded evidence; target-hardware battery characterization remains a documented limitation until real hardware is available. See `docs/VALIDATION_USABILITY.md` and `docs/KNOWN_LIMITATIONS.md`.

### P19 — Open-Source Release Candidate

P19 adds the independent-machine release path required by the roadmap: Docker packaging, local Supabase bootstrap/reset, synthetic-only seed data, deterministic Mission Day 127 sample generation, API/adapter reference documentation, release checklists, and GitHub issue/PR templates. Lovable is not required to reproduce the release candidate from source. See `docs/RELEASE_CANDIDATE.md` and `docs/LOCAL_REPRODUCIBILITY.md`.

Quick local reproduction:

```bash
bun install --frozen-lockfile
bun run setup:local
bun run check
bun run dev
```

Docker application path after `setup:local`:

```bash
bun run docker:up
```

### P20 — Challenge Demo & Submission

P20 adds the controlled three-minute judge narrative, `/mission/submission`, video/storyboard and fallback runbooks, poster/architecture content, NASA/Space Apps attribution, and a strict evidence ledger. The final judge-facing hardware path is zero-install and browser-first: Phone Camera PPG, phone motion and direct Web Bluetooth where supported, with `/mission/devices` exposing capability detection. The structural P20 verifier is part of `bun run check`; the separate `bun run submission:gate` intentionally fails until the team records the required real-device session, independent P19 reproduction evidence, and final original video. Pending evidence must never be promoted to PASS by assumption. See `docs/SUBMISSION_PACKAGE.md` and `docs/ZERO_INSTALL_LIVE_DEVICE_DEMO.md`.

### Mission history

`/mission/records` shows encrypted local mission records and, for authenticated mission members, the RLS-authorized Supabase copy. `/mission/offline` exposes local readiness, queue state and governed manual synchronization without enabling anonymous medical-data writes.

### P20 hardware evidence

- P20-HW-001 real zero-install device evidence: READY (Samsung Galaxy S24, Chrome on Android; Camera PPG + phone motion).
- Controlled artifact: `data/submission/p20-real-device-evidence.v1.json` (no raw health values).

### Published offline and mission history behavior

Offline Mission Mode and Recorded Mission Data now fail closed without losing
local evidence: missing cloud configuration is reported as configuration
required rather than leaving the UI in a permanent checking state. The offline
page uses the single global navigation header.

### Mission Identity & Sign-in

The production console includes `/mission/identity` for Supabase Auth, active mission membership selection and governed one-time mission invitations. Authentication does not bypass RLS; cloud synchronization remains locked until an active mission membership exists. New live physiological observations use the selected `crew_self` mission context when available, otherwise they remain in the encrypted local fallback context.

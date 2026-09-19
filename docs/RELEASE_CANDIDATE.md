# P19 Open-Source Release Candidate

P19 packages the P0-P18 implementation as a reproducible open-source release candidate.

## Release-candidate contents

- Apache-2.0 project license and contributor/security governance
- deterministic Bun dependency lockfile
- Docker application image
- local Supabase workflow using repository migrations
- local synthetic seed data
- deterministic Mission Day 127 sample generator
- architecture, science, security, API/adapter and operational documentation
- GitHub issue and pull-request templates
- quality/security CI gates
- explicit known limitations and validation evidence

## Canonical source

GitHub is the canonical source repository. Lovable may accelerate editing but is not required to reproduce the release candidate.

## Reproduction gate

An independent machine should be able to:

1. clone the repository;
2. install dependencies from `bun.lock`;
3. start/reset local Supabase through Docker;
4. obtain browser-safe local environment configuration without exposing service-role credentials;
5. run the full quality/security gate;
6. start the application locally or build/run the Docker image;
7. generate deterministic synthetic sample data.

See `docs/LOCAL_REPRODUCIBILITY.md`.

## Release labeling

Challenge-development releases remain `v0.x`. Do not label this repository `v1.0` until the final release criteria are intentionally met. P20 owns the challenge demo/submission package and presentation-readiness gate.

## Safety statement

This release candidate is a software prototype and is not clinically validated. It does not diagnose, prescribe treatment, replace medical/flight-medicine authority, or establish operational NASA flight rules.

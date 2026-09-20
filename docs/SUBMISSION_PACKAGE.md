# P20 Challenge Submission Package

## Repository-controlled materials

- `docs/CHALLENGE_DEMO_SCRIPT.md`
- `docs/VIDEO_STORYBOARD.md`
- `docs/DEMO_FALLBACK_RUNBOOK.md`
- `docs/POSTER_ARCHITECTURE.md`
- `docs/NASA_RESOURCE_ATTRIBUTION.md`
- `docs/KNOWN_LIMITATIONS.md`
- `docs/P20_REAL_DEVICE_EVIDENCE.md`
- `CITATIONS.md`
- `data/submission/p20-evidence.v1.json`
- `data/submission/p20-real-device-evidence.v1.json`
- `data/release/mission-day-127.synthetic.json`

## Product links

- Production: https://mitochondria.edocinfo.com
- Judge demo route: https://mitochondria.edocinfo.com/mission/submission
- Mission scenario: https://mitochondria.edocinfo.com/mission/simulation
- Validation & limitations: https://mitochondria.edocinfo.com/mission/validation
- Repository: https://github.com/computech-gr/astro-vitality-core

## Final human/external evidence required before submission

1. Real physical live-device evidence (zero-install) is recorded in `docs/P20_REAL_DEVICE_EVIDENCE.md` and `data/submission/p20-real-device-evidence.v1.json`.
2. Obtain a passing independent-machine/release-candidate reproduction result from a machine or CI runner with Docker and Supabase CLI.
3. Record and publish the final original challenge video; store the public URL in the evidence ledger.
4. Re-check the official 2026 submission/judging instructions at hackathon time because the controlled P0 baseline explicitly marks them as subject to verification.
5. Verify rights/consents for every submitted image, voice, likeness, video and third-party asset.

`bun run submission:gate` is the strict final gate. It must fail while any critical evidence remains pending or blocked.

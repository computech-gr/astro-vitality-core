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
- `data/submission/p19-independent-reproduction.v1.json`
- `data/submission/p20-final-external-evidence.v1.json`
- `data/release/mission-day-127.synthetic.json`

## Product links

- Production: https://mitochondria.edocinfo.com
- Judge demo route: https://mitochondria.edocinfo.com/mission/submission
- Mission scenario: https://mitochondria.edocinfo.com/mission/simulation
- Validation & limitations: https://mitochondria.edocinfo.com/mission/validation
- Repository: https://github.com/computech-gr/astro-vitality-core

## Final human/external evidence required before submission

1. Real physical live-device evidence (zero-install) is recorded in `docs/P20_REAL_DEVICE_EVIDENCE.md` and `data/submission/p20-real-device-evidence.v1.json`.
2. Release-candidate independent-machine reproduction is complete and recorded in `data/submission/p19-independent-reproduction.v1.json`.
3. Record and publish the final original challenge video; store the public URL in the evidence ledger.
4. Re-check the official 2026 submission/judging instructions at hackathon time because the controlled P0 baseline explicitly marks them as subject to verification.
5. Verify rights/consents for every submitted image, voice, likeness, video and third-party asset.

Run `bun run sample:release` before `bun run submission:manifest`; manifest generation fails closed if any required controlled input is missing. `bun run submission:gate` then verifies every manifest file exists and matches its recorded byte count and SHA-256, and it must fail while any critical evidence remains pending or blocked. `P20-VIDEO-001` and `P20-RULES-001` cannot be READY without complete human/external evidence in `data/submission/p20-final-external-evidence.v1.json`.

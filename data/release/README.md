# Release sample data

This directory is for reproducible, public, synthetic release-candidate data only.

Run:

```bash
bun run sample:release
```

The command writes `mission-day-127.synthetic.json` from the deterministic P17 generator. The generated file contains no real astronaut or patient data and must preserve `classification: synthetic` / `synthetic:true` markers on health observations.

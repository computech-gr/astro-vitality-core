# P20 Live Demo Fallback Runbook

## Primary

Use the real physical heart-rate path on `/mission/live` (direct BLE or the Samsung Health/Health Connect companion), then continue through the controlled three-minute route sequence.

## Fallback A — deterministic software replay

Use `/mission/simulation` with `mission_day_127_fatigue_recovery`. Confirm the scenario fingerprint before presenting. Synthetic records must remain visibly marked synthetic.

## Fallback B — original recording

Use the final team-recorded challenge video. Keep a local copy on the presentation laptop and a publicly accessible hosted copy if the submission form requires a link.

## Fallback C — static evidence

Keep screenshots of the live dashboard, intelligence, guidance, offline and ground-console surfaces. Label these as screenshots; never describe them as a live run.

## Failure rules

- Never fabricate a live sensor connection.
- Never remove synthetic labels.
- Never claim cloud synchronization if the backend is unavailable during the demo; describe the validated store-and-forward path instead.
- Never hide known limitations.

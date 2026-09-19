# P9 Astronaut Live Dashboard

P9 turns the already-governed adapter and canonical-observation layers into an astronaut-facing live view. The exit gate from the controlled roadmap is live updates with explicit stale and disconnected states.

## Scope

The dashboard shows:

- live/near-live vital and habitat cards;
- technical freshness state (`LIVE`, `STALE`, `DISCONNECTED`, `WAITING`);
- observation data quality;
- source/device connection state and last-sample time;
- short recent numeric trends without clinical interpretation;
- a mission-local event timeline;
- a deliberately simple self-check placeholder for P9.

The first direct hardware path exposed in the browser is the P6 Web Bluetooth Heart Rate Service adapter. Other cards stay disconnected/waiting unless their governed adapters actually supply observations. The UI must never fabricate a value to look complete.

## Scientific and safety boundary

The Biomarker Matrix v1.1 identifies heart rate, respiratory rate and SpO2 as P0 live signals and requires signal-quality/context handling. Environmental measures such as CO2, oxygen and pressure share the mission timeline. P9 displays those observations; it does not diagnose, score risk, apply personal baselines, or introduce health thresholds.

The dashboard freshness windows are **technical recency windows only**. They answer whether a live feed is recent enough to display as live. They are not physiological limits and must not be reused as health logic.

The P9 self-check is also intentionally non-diagnostic. P11 owns governed cognitive/behavioral tasks, fatigue/stress/workload instruments and their scientific interpretation.

## Persistence boundary

P9 originally shipped session-local. P14 now connects accepted live observations and the simple self-check to the encrypted local event store and sync queue. Cloud/database durability is still not claimed until an authorized remote sync transport is connected.

## Real-device path

When the user selects **Connect BLE heart rate** in a compatible browser:

1. the P6 standard Heart Rate Service adapter requests a device;
2. connection state is surfaced in the dashboard;
3. packets are normalized through the P5 adapter runtime and P4 canonical ingestion;
4. accepted canonical heart-rate observations update the card and timeline immediately;
5. disconnect or stale data is shown explicitly.

No cloud round-trip is required for the live visual update.

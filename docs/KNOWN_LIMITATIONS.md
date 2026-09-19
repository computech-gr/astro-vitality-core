# Known Limitations — P18 Validation Baseline

P18 documents limitations rather than hiding them. This file is part of the validation evidence for the challenge prototype.

## Clinical status

The Mitochondria is **not clinically validated**, is not a certified medical device, and does not provide autonomous diagnosis, treatment prescriptions, fitness-for-duty determinations or flight-rule decisions. Biomarker Matrix v1.1 is a team-biologist scientific implementation review, not clinical validation.

## Hardware coverage

The browser Web Bluetooth heart-rate path is implemented. Health Connect, HealthKit, vendor-cloud, environmental and radiation integrations are adapter/bridge targets and may require native hosts, credentials or target hardware. Synthetic P17 scenarios must remain visibly synthetic and are not evidence of hardware performance.

## Battery

The source roadmap calls for battery testing. Real battery drain is hardware-, radio-, sampling- and host-dependent. The repository does not infer a battery percentage or drain rate from synthetic data. An instrumented target-hardware session remains a final-submission evidence task once hardware is selected.

## Latency

P18 requires measured local-path latency evidence. The architecture intentionally keeps the live sensor-to-astronaut path local and does not require a cloud round-trip. Browser measurements are environment-specific and must record device/browser conditions; they are engineering observations, not physiological thresholds.

## Scientific and operational boundaries

- Clinical/reference intervals, personal baseline and mission operational limits remain separate governed layers.
- Research-only relationships cannot become operational actions.
- CO2/cognition remains contextual/non-causal unless stronger claim-specific evidence is approved.
- Radiation telemetry does not produce an autonomous biological risk score.
- Missing or poor-quality safety-relevant values are never silently imputed.
- Future clinical thresholds and escalation wording require qualified clinical/flight-medicine governance.

## Challenge-data boundary

The public repository uses synthetic or cleared demo data only. No real astronaut or patient medical records belong in the public project.

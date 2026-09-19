# P8 Environmental & Radiation Telemetry

P8 connects spacecraft/habitat context and personal radiation dosimetry to the same governed canonical observation model used by physiological, wearable and laboratory inputs.

## Scope

P8 adds two integration boundaries:

- `EnvironmentalTelemetryAdapter` for habitat gateways delivered through MQTT, WebSocket or REST clients injected by the host runtime.
- `RadiationDosimeterAdapter` for personal/device dosimetry records.

The adapters do not own network credentials, authentication tokens or transport sessions. Those remain outside the domain/integration contract and are supplied by an authorized host implementation.

## Reviewed environmental metrics

The current v1.1 scientific baseline allows the adapter to expose only canonical environmental metrics already present in the reviewed registry, including:

- CO2 concentration;
- oxygen concentration and oxygen partial pressure;
- cabin pressure;
- temperature;
- relative humidity;
- noise exposure;
- light exposure;
- carbon monoxide.

Unreviewed vendor-specific scores fail closed and are not promoted into the canonical model.

## Radiation quantities

P8 preserves three distinct reviewed quantities:

- absorbed dose (`radiation.absorbed_dose`, canonical mGy);
- dose equivalent (`radiation.dose_equivalent`, canonical mSv);
- dose rate (`radiation.dose_rate`, canonical µSv/h).

Gy-derived and Sv-derived quantities are not numerically merged or treated as interchangeable. Detector type, radiation field and location can be preserved as context tags.

## Context and provenance

Environmental readings can retain compartment/location tags so that a physiological change can later be aligned with the actual habitat context without implying causality. Radiation records can retain detector and radiation-field context.

Every record still passes through the P4 canonical registry and unit-normalization boundary before it is accepted.

## Safety boundary

P8 does not introduce:

- habitat operational thresholds;
- medical diagnosis;
- direct CO2-to-cognition causality claims;
- radiation biological-risk scoring;
- autonomous emergency actions;
- persistence/database schema;
- credentials or vendor secrets.

Operational limits and safety actions require later governed mission/medical rules.

## Offline direction

Both integration boundaries expose resume cursors through the P5 adapter contract. This is the prerequisite for later P14 store-and-forward synchronization, but P8 itself does not claim durable offline persistence.

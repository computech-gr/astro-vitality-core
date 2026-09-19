# P5 Universal Device Adapter SDK

P5 introduces a vendor-neutral adapter boundary between external sensors/data transports and the P4 canonical health model.

## Contract

Every adapter exposes the same lifecycle: `discover()` → `connect()` → `capabilities()` → `stream()` → `quality()` / `normalize()` → `syncCursor()` → `health()` → `disconnect()`.

The contract supports BLE, Health Connect, HealthKit bridge, vendor API, file import, MQTT, WebSocket, REST and synthetic/reference transports without making any one provider part of the domain model.

## Safety and data integrity

Adapters may only advertise canonical metric codes already governed by P4. Unknown vendor scores fail closed instead of silently becoming health metrics. Scalar packets are normalized through the existing P4 ingestion pipeline; series packets use the P4 raw-signal validator. Source value/unit, adapter identity, quality and provenance remain traceable.

Clock metadata is explicit at the adapter boundary so source time, receipt time, offset and uncertainty can be preserved by future persistence/synchronization work. Resume cursors are opaque adapter-owned values and are never interpreted by the health domain.

## Reference adapter

`ReferenceDeviceAdapter` is a deterministic SDK conformance fixture used by tests. It is not a product simulator and does not claim support for any real wearable. Real BLE/device integrations begin after this SDK boundary is stable.

## Not in P5

P5 does not add Supabase tables, device credentials, real vendor APIs, Bluetooth permissions, clinical thresholds, alert reasoning, UI device pairing, or autonomous diagnosis.

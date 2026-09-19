# P6 Wearables Integration Pack

P6 connects the P5 adapter SDK to concrete wearable source classes while preserving the P4 canonical health-data boundary.

## Implemented source classes

### Direct BLE heart rate

`WebBluetoothHeartRateAdapter` implements the standard Bluetooth Heart Rate Service and Heart Rate Measurement characteristic. Discovery is user-gesture driven through Web Bluetooth; the adapter parses 8-bit and 16-bit heart-rate values, emits canonical `phys.heart_rate` packets, and exposes connection/health state.

Web Bluetooth availability is browser/platform dependent. P6 does not claim compatibility with every BLE wearable or medical device.

### Android Health Connect bridge

`createHealthConnectAdapter()` wraps a host-provided native/mobile bridge. The web application does not pretend that browsers can call Android Health Connect directly. A future Android host must supply permission handling and record access through the bridge contract.

Only metric codes present in the reviewed P4 canonical registry are advertised or emitted. Unknown app/vendor scores fail closed.

### Apple HealthKit bridge

`createHealthKitAdapter()` uses the same host-bridge contract for an iOS/native wrapper. HealthKit authorization and native API calls remain outside the web bundle and are not simulated as completed platform support.

### Vendor cloud wearables

`VendorCloudWearableAdapter` accepts an injected vendor client for history imports. OAuth/token acquisition and secure credential storage remain outside the adapter. The adapter receives only authorized records and resume cursors; it never owns or persists credentials.

## P6 conformance gate

Tests prove that three distinct source classes — direct BLE, Health Connect bridge, and vendor cloud — can feed the same reviewed P4 canonical metric (`phys.heart_rate`) through the P5 ingestion boundary. HealthKit bridge capability filtering is also tested.

This is an integration-contract milestone, not a claim that named commercial vendors have granted production API access or that physical hardware has been flight/medical validated.

## Safety and privacy

- No proprietary recovery/readiness/stress score enters the health model unless it has an explicit reviewed canonical metric.
- No OAuth tokens or device credentials are committed to source.
- No Supabase schema, migration, or persistent medical record is added in P6.
- Real device identifiers and health records require later privacy, persistence, consent, and mission-governance work.
- Consumer wearable data remain quality/provenance tagged and must not be treated as equivalent to medical-grade measurements without evidence.

## Next integration work

Later phases may add pulse oximetry, blood pressure, smart garments, sleep/activity details, environmental sensors, radiation dosimetry, and production mobile/native bridges. Those additions must implement the same P5 lifecycle and normalize through P4.

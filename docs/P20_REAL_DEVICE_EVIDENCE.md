# P20 real-device evidence

## Evidence ID

`P20-HW-001` — real live-device path.

## Recorded production session

A real zero-install physical session was exercised against the published Mitochondria console on 2026-09-20 using a Samsung Galaxy S24 with Chrome on Android.

Observed paths:

- **Phone Camera PPG — PASS.** The user granted camera permission, the browser camera path connected, real camera-derived heart-rate observations reached the live card and mission timeline, and the observations were written to encrypted local persistence.
- **Phone Motion Sensors — PASS.** Device-motion samples reached the live UI and encrypted local persistence.
- **Direct Bluetooth Sensor — chooser path verified only.** The browser device chooser opened, but no compatible standard BLE Heart Rate Service sensor was available, so BLE hardware is not claimed as tested.

The recorded session is evidence of physical I/O integration and store-and-forward behaviour. It is **not** a clinical-validation claim. Camera PPG remains a pulse/heart-rate estimate and is not ECG.

## Privacy

The repository-controlled evidence artifact intentionally contains no raw physiological values, personal identifiers, video frames, or other medical payloads. Raw observations remain inside the governed mission data paths.

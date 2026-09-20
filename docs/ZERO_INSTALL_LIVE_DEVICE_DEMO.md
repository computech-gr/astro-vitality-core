# Zero-Install Live Device Demo

## Purpose

The judge-facing P20 hardware demonstration must run from the published web console at `https://mitochondria.edocinfo.com` without requiring the evaluator to install an APK, vendor application, browser extension, or proprietary desktop client.

The production demo therefore uses browser-native, permission-gated sources first:

1. **Phone Camera PPG** — estimates pulse/heart rate from rear-camera photoplethysmography after explicit camera permission. This is a pulse estimate, not ECG and not a clinically validated measurement.
2. **Phone Motion Sensors** — records tri-axial acceleration as activity/motion context and artifact evidence where the browser exposes DeviceMotion.
3. **Direct Web Bluetooth** — connects a user-selected BLE sensor exposing the standard Heart Rate Service when the browser supports Web Bluetooth.

Optional Health Connect, HealthKit and vendor-cloud adapters remain architectural extension points, but they are not required for the challenge live demonstration.

## Cross-platform behavior

The console detects capability at runtime and never presents an unsupported path as if it were available.

- Android/Chromium-class browsers may expose camera, motion and Web Bluetooth.
- iPhone/WebKit browsers may expose camera and motion but not direct Web Bluetooth.
- If a capability is unavailable, the console reports that limitation and leaves the other live paths usable.

## Judge demo sequence

1. Open `/mission/devices` and show the capability check for the current browser.
2. Open `/mission/live#live-sources`.
3. Start **Phone Camera PPG** on a team phone or judge-selected phone.
4. Grant camera permission, cover the rear camera with a fingertip, and keep still while signal quality settles.
5. Show the live pulse estimate, source, timestamp, data-quality state and physical sample count.
6. Remove the fingertip and show that quality degrades/stops instead of inventing a continuing value.
7. Optionally connect **Phone Motion Sensors** and move the device to show live acceleration context.
8. If a standard BLE heart-rate sensor is available, use **Scan Bluetooth sensor** as an additional zero-install hardware proof.
9. Download the non-value evidence receipt. It records source identity, metric codes, counts and timestamps, but not raw physiological values.

## Scientific and safety boundaries

- Camera PPG is used only for pulse/heart-rate estimation and signal-quality demonstration.
- The camera path must not claim ECG, blood pressure, glucose, body temperature or clinically validated SpO2.
- Motion data are context/artifact signals, not a diagnosis or a generic wellness score.
- Missing or poor-quality inputs remain missing/poor; the system must not silently impute values for demo appearance.
- Other health domains remain visible through their correct source classes: wearable/device, environmental/radiation, cognitive/behavioral assessment, sleep/history, and laboratory/medical ingestion.

## Camera diagnostics

The Camera PPG path exposes browser/device diagnostics instead of collapsing failures into a generic permission message. It reports the browser DOMException name (including `NotAllowedError`, `NotFoundError`, and `NotReadableError`), the Permissions API camera state when available, HTTPS/top-level context, visible video-input count, rear-camera detection state, page visibility, and whether a camera-busy/OS-lock condition is plausible. A `NotReadableError` can indicate that another application owns the camera, but the browser cannot prove that condition uniquely, so the console labels it as possible rather than certain.

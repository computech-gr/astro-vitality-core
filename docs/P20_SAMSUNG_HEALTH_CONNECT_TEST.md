# P20-HW-001 — Samsung / Health Connect Physical Device Test

## Purpose

The controlled P0 baseline requires **at least one real live-device path before final submission**. A manual form or synthetic stream does not satisfy this evidence gate.

For the team's Samsung phone + compatible Galaxy Watch path, the preferred architecture is:

**Galaxy Watch → Samsung Health on the phone → Android Health Connect → Mitochondria Android companion → P6 Health Connect adapter → P4 canonical observation → Live Dashboard → P14 encrypted local persistence → governed sync queue.**

This path is deliberately separate from direct Web Bluetooth. Galaxy Watch data can be synchronized into Health Connect through Samsung Health; the synchronization cadence is controlled by Samsung Health/Health Connect and must not be described as guaranteed second-by-second BLE streaming.

## Why an Android companion exists

Health Connect is an Android API and is not directly available to a normal web page. The repository therefore contains a thin Android wrapper in `android-companion/` that:

- loads only the canonical published Mitochondria site,
- requests **read-only heart-rate permission**,
- injects the `MitochondriaHealthConnect` JavaScript interface,
- reads Health Connect heart-rate records,
- does not write values back to Health Connect,
- contains no Supabase service-role secret or vendor credential.

The ordinary web application fails closed when this bridge is absent.

## Samsung phone/watch preparation

1. Update Samsung Health on the phone and watch.
2. Confirm the watch is paired to the Samsung phone and heart-rate collection is enabled.
3. In Samsung Health, open **Settings → Health Connect** and grant Samsung Health permission to share **Heart rate** with Health Connect.
4. Trigger/record a fresh physical heart-rate measurement on the watch and allow Samsung Health to synchronize it to the phone.
5. Build/install the `android-companion` app on the Samsung phone and grant its Health Connect **Heart rate read** permission. The repository includes a GitHub Actions workflow (`Android Health Connect Companion`) that builds a debug APK without requiring local Android Studio.

Samsung documents that Galaxy Watch health data reaches Samsung Health on the phone and can then be synchronized to Health Connect. Timing/frequency from the watch to Samsung Health follows Samsung's battery/synchronization policy, so record observed latency honestly in the evidence notes.

## Evidence session

1. Open the Android companion. It loads `https://mitochondria.edocinfo.com/mission/live`.
2. Confirm the dashboard shows **Health Connect bridge: AVAILABLE**.
3. Select **Connect Health Connect**.
4. Wait for at least one physical heart-rate sample to appear on the canonical `phys.heart_rate` card.
5. Confirm the source status is connected and the sample is classified as `medical_sensitive`, not `synthetic`.
6. Confirm **Encrypted writes** increments after the observation crosses the P14 local persistence boundary.
7. Record a screenshot/video showing the watch, phone, source status and live dashboard in the same evidence session where practical.
8. Use **Download non-value evidence receipt**. The receipt contains timestamps, adapter/source metadata, metric codes and counts but deliberately excludes raw physiological values.
9. Keep the evidence receipt/private recording outside the public repository until the team has reviewed it for privacy.

## P20 gate rule

Do **not** change `P20-HW-001` from `pending_human` to `ready` merely because this code exists. The gate can become ready only after the team performs a real physical session and records reviewed evidence identifying the device/path used.

## Direct BLE fallback

If the available wearable exposes the Bluetooth SIG Heart Rate Service, the existing **Connect BLE heart rate** path is the more direct stream and may be used for P20-HW-001. A separate BLE chest strap can therefore be used if a Galaxy Watch/Health Connect session does not provide sufficiently timely updates for the live demo.

## Privacy boundary

Real health values are personal health data. They must not be committed to the public repository or copied into synthetic fixtures. The downloadable P20 receipt intentionally omits raw values.

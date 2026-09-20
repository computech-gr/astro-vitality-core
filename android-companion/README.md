# Mitochondria Android Health Connect Companion

This is a deliberately thin Android wrapper for the P20 real-device evidence session. It loads the canonical published Mitochondria console in a WebView and injects a narrowly scoped JavaScript bridge that can **read heart-rate records only** from Android Health Connect.

It exists because Health Connect is an Android API, not a browser API. The normal web application continues to fail closed when the native bridge is absent.

The companion does not contain Supabase credentials, does not write back to Health Connect and does not store raw health values in the repository.

See `docs/P20_SAMSUNG_HEALTH_CONNECT_TEST.md` for the controlled team procedure.


## Build

The repository workflow `.github/workflows/android-companion.yml` builds a debug APK with Java 17 + Gradle 8.9 and uploads it as the `mitochondria-health-connect-companion-debug` artifact. This is intended for controlled team testing, not Play Store distribution.

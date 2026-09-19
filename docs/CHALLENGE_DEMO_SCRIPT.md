# P20 Challenge Demo Script — 3 Minutes

This script is the controlled demo narrative for the 2026 NASA Space Apps Challenge. It does not authorize medical claims and it must not claim that pending evidence has passed.

## 0:00–0:25 — Problem and thesis

“Long-duration crews cannot depend on a continuous Earth connection to understand their health. The Mitochondria is an open-source, offline-first health intelligence platform that combines astronaut physiology, cognition, laboratory context and spacecraft environment into one explainable mission-health loop.”

## 0:25–0:50 — Real live device path

Open `/mission/live` and connect the team’s real BLE heart-rate device. State the exact device used. If physical hardware is unavailable during judging, say so explicitly and move to the deterministic fallback; do not present synthetic data as live hardware.

## 0:50–1:20 — Mission Day 127

Open `/mission/simulation`. Run the deterministic Mission Day 127 scenario. Explain that physiological, cognitive, environmental, radiation and laboratory-context signals share timestamps, provenance and quality metadata. Point out that the public demo dataset is synthetic.

## 1:20–1:50 — Detect and explain

Open `/mission/intelligence`. Show a reviewed multi-signal pattern with evidence, confidence, uncertainty and confounders. Then show the data-quality case. Missing or poor data must remain a data-quality problem rather than becoming a medical event.

## 1:50–2:15 — Act safely

Open `/mission/guidance`. Show bounded, protocol-linked guidance such as repeat measurement, recovery/workload review or environmental review. State that the platform does not diagnose and that medical escalation requires a separately governed trigger.

## 2:15–2:40 — Lose Earth

Open `/mission/offline`. Demonstrate that the local mission loop continues with encrypted local persistence and a store-and-forward queue while connectivity is unavailable.

## 2:40–3:00 — Reconnect and close

Open `/mission/ground`. Show governed synchronization, role separation, audit trail and research de-identification. Close with: “The cloud is not in the critical sensor-to-astronaut path. The project is open source, reproducible and designed so new devices can enter through one canonical adapter boundary.”

## Fallback order

1. Real live BLE path if available.
2. Deterministic Mission Day 127 replay.
3. Pre-recorded original team video only if the live environment fails.
4. Static screenshots are last-resort evidence and must be labeled as such.

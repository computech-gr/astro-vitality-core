# P11 — Cognitive & Behavioral Module

P11 implements the governed cognitive/behavioral measurement boundary required by the scientific baseline. It is a longitudinal measurement module, not a psychiatric diagnostic system and not a fitness-for-duty classifier.

## Source alignment

The reviewed `SPACE_APPS_2026_Astronaut_Biomarker_Matrix_v1.1.xlsx` requires named, repeatable cognitive tasks; practice/device latency awareness; private behavioral measures; personal-baseline interpretation; task-linked NASA-TLX workload; and no psychiatric diagnosis from trends. The roadmap requires a daily demo flow under three minutes.

## Daily demo flow

`/mission/readiness` provides:

1. schedule/work-rest context and recent sleep duration;
2. fatigue state VAS (0–10), KSS sleepiness (1–9), and state-stress VAS (0–10);
3. a 60-second PVT-style software demonstration path that records raw response timing and false starts;
4. review without a readiness score, diagnosis, alert, treatment recommendation, or persistence.

The abbreviated 60-second task is explicitly **demo-only**. It does not claim equivalence to a validated full PVT protocol. Mission use requires a scientifically governed protocol defining task duration, input-latency controls, practice handling and any lapse threshold.

## Scientific safeguards

- Reaction-time scoring corrects for supplied device/input latency.
- A lapse count is emitted only when a governed protocol explicitly supplies a lapse threshold; the demo does not invent one.
- Practice run number and protocol version are part of the measurement contract.
- Fatigue, sleepiness and stress are private longitudinal state measures, not diagnoses.
- Mood/affect is present in the canonical catalogue as medical-context data but is not collected by the P11 demo until a governed validated item set is selected.
- Working-memory support is represented in the canonical catalogue but is not forced into the daily <3-minute demo flow.
- NASA-TLX is task/shift linked and preserves all six dimensions rather than reducing workload to an opaque wellness score.
- P11 does not infer causality between CO2, HRV, cortisol, EDA, sleep or subjective stress. P12 may evaluate governed multi-signal relationships with explicit evidence and uncertainty.

## Privacy and persistence

P11 observations are classified as `medical_sensitive`. The current UI keeps its assessment state in the browser session only. Encrypted local persistence, synchronization, conflict resolution and ground-console access controls remain later governed phases.

## Canonical outputs

The P11 boundary can emit reviewed canonical observations including:

- `cognition.pvt_median_rt`
- `cognition.pvt_lapses` only when a governed lapse threshold exists
- `behavior.fatigue_state`
- `behavior.sleepiness_kss`
- `behavior.stress_state`

The scientific catalogue also contains governed future-ready entries for working memory, mood/affect context, and six NASA-TLX subscales.

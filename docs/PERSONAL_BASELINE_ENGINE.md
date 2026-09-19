# P10 — Personal Baseline Engine

P10 implements the versioned individual-longitudinal baseline model required by the scientific foundation. It is a comparison engine, not an alert engine and not a diagnostic layer.

## Scientific invariants

- A single measurement is never a personal baseline.
- Pre-flight reference profiles are immutable once created.
- Launch/transition observations do not replace the pre-flight comparator.
- Early adaptation may produce rolling summaries, but pre-flight remains the primary comparator so adaptation does not silently normalize away deterioration.
- Stable-mission profiles may use a versioned rolling window only after explicit minimum-data, coverage, quality and context requirements pass.
- Return/recovery is compared toward the pre-flight reference and is not silently merged into in-flight distributions.
- Clinical/reference intervals, mission operational limits and personal baselines remain separate layers.
- No P10 output is a diagnosis, action recommendation or clinical threshold. P12/P13 own governed intelligence and action logic.

## Baseline policy

Every profile is built from an explicit `BaselinePolicy`. The caller must specify the metric, phase, minimum observations, minimum time coverage, accepted data-quality levels, accepted observation statuses, required context tags and algorithm/version provenance. There are no hidden metric-specific thresholds in the engine.

Context tags are deliberately explicit. Circadian-sensitive measures such as HRV or cortisol must be supplied with a governed time/context tag upstream; P10 does not guess biological time from UTC timestamps.

## Statistics and deltas

For numeric scalar metrics that the v1.1 canonical catalogue marks `personalBaseline: true`, the engine records count, mean, median, sample standard deviation, minimum and maximum. A compatible current observation can expose:

- absolute delta from the expected personal value;
- percentage delta when the expected value is non-zero;
- standardized delta when baseline variance is available; and
- baseline-estimate uncertainty (standard error of the mean).

These quantities describe longitudinal deviation only. Their magnitude is not automatically mapped to INFO/WATCH/ACTION/ESCALATE.

## Dashboard integration

The P9 live dashboard can now hold a validated baseline profile per metric and display a personal-baseline delta next to the actual live value. If no profile exists, it explicitly states that the baseline is not established. If required context does not match, it reports a context mismatch rather than calculating a misleading delta.

The dashboard does not fabricate a pre-flight profile from the current mission session. Real profile persistence/loading remains a later storage/backend concern.

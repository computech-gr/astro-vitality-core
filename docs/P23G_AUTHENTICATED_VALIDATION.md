# P23G — Authenticated persistence validation handoff

This patch adds a non-writing, user-facing test checklist to Offline Mission Mode and improves read-only cloud evidence handling. It does not provision accounts, create synthetic measurements, bypass RLS or claim real-device success.

## Validation procedure

1. Provision a dedicated test identity through existing governed operator/invite flows; do not share passwords in chat.
2. Sign in on the published origin, select an authorized crew-self mission membership, and verify Bone Health selectors.
3. Capture clearly labelled synthetic data using the normal app controls. Sync while online.
4. Use the read-only evidence panel and inspect mission_events plus crew_health_record_index using authorized access. Confirm correct mission, crew, event ID, metric_code, duplicate handling and cross-crew isolation.
5. Repeat on a real device with offline capture and reconnect. Record exact results and blockers.
6. Do not reset/reassign quarantined historical records; use independent provenance review.

## Limits

The evidence panel reads up to 300 local and 300 cloud events; mismatches at that limit are inconclusive. Cloud query errors must not be shown as zero cloud matches. Browser/device testing cannot be certified without an actual authorized sign-in and test execution.

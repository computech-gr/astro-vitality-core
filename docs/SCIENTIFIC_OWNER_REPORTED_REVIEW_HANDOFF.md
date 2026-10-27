# MITOCHONDRIA scientific review handoff — owner report (2026-10-27)

The project owner states that Nikolas verbally reviewed and approved all existing scientific reference proposals. This is an **owner-reported assertion**, not a signed, independently verifiable per-entry review record.

## Source distinctions

- `data/scientific/p355-proposed-domain-catalog.v1.json` retains the historical `PENDING_NIKOLAS_REVIEW` source metadata unchanged.
- `data/scientific/nikolas-immune-intake.v1.json` and `nikolas-behavioral-intake.v1.json` document Nikolas-linked source material, but mark operational use as not approved.
- `data/scientific/p38-nikolas-reconciliation.v1.json` reports only two exact normalized name matches among 216 source rows; this is **not** proof of per-entry equivalence or activation.

## Reviewer confirmation required before source status promotion

Nikolas should confirm the exact catalog version/hash, the set of entry IDs, any exceptions and the scope of his approval in a dated record. Scientific review does not confer clinical validation, approved thresholds, automatic decisions, or ingestion activation.

This patch changes UI navigation and provenance wording only. It deliberately does **not** change scientific source statuses, database migrations, access controls or operational activation.

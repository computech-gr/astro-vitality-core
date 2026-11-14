# P72 examination copy rules

- Synthetic examination copies are built only by the pure plan in p72-copy-plan.ts and written only by scripts/p72-examination-copy.ts after explicit operator approval: deterministic IDs bound to source record + target scope keep re-runs idempotent, copies start pending review with reviewer confirmation cleared, and attestations, corrections and approvals are never copied, so a copy can never inherit another mission's human decisions.
- Demo-catalog (demo:ubt-*) records stay held for any other mission because their catalog authorization is mission-bound.
- Rollback is append-only (withdraw mode writes "erroneous" status events); source rows are never modified.

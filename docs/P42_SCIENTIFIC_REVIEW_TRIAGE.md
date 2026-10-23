# P42 — Scientific semantic triage (research only)

This package transforms the 54 P39 mapping suggestions into a structured scientific review queue. It **does not** make independent reviewer decisions, resolve unit/protocol ambiguity, or change the 216-row P40/P41 ledger.

Each candidate requires independent confirmation of analyte identity, specimen, collection method, assay platform, protocol, units, baseline context, provenance and privacy/consent before any documentary decision. An alias is not proof of interchangeable measurements. Related-but-distinct measurements must never be silently merged.

All 54 entries remain `PENDING_INDEPENDENT_SCIENTIFIC_REVIEW` and `operational_activation=false`. No changes to the existing application, database, medical decision support or clinical permissions are authorized.

## Next human action

An independent qualified scientific reviewer should annotate the existing P41 workbook with evidence and rationale for each row, starting with the 54 mapped candidates. Decisions must be reviewed against the original scientific handbooks and primary sources, not inferred from name similarity alone. The 162 unmapped records remain open.

## Validation

Run `node scripts/verify-p42-semantic-triage.mjs` then the repository's full CI on GitHub Actions. The verifier checks exact coverage, source IDs, pending statuses and unchanged activation flags.
